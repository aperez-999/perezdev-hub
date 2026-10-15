import { join } from "node:path";
import type { AgentSpec, McpDependency, ToolId } from "../core/agent-spec.js";
import type { Scope } from "../core/scope.js";
import { readIfExists, sameText } from "../util/fs-safe.js";
import { upsertSection } from "./context.js";
import { mcpFormat } from "./mcp-config.js";
import { renderRule, renderSkill, renderWindsurfRule } from "./render.js";
import { mcpConfigPath, tool, toolPaths } from "./tools.js";

/** A file perezdev intends to write, for diff preview before committing. */
export interface PlannedFile {
  path: string;
  /** New full contents to write. */
  contents: string;
  /** Existing contents (null if the file does not exist yet). */
  previous: string | null;
  /** Tools that read this file. */
  tools: ToolId[];
  /** Agent files are owned outright; MCP configs and sections of shared files are merged. */
  kind: "agent" | "mcp" | "section";
  /** Bundled scripts with a shebang are written executable. */
  executable?: boolean;
}

/** One generated agent file and the tools that load it. */
export interface AgentFile {
  path: string;
  tools: ToolId[];
  render: (spec: AgentSpec) => string;
  executable?: boolean;
  /** A file bundled with a skill, as opposed to its SKILL.md or a rule file. */
  resource?: boolean;
}

/**
 * Pick skills directories so each target loads the skill exactly once where
 * possible. Tools that read only one directory claim it first; tools that read
 * several (Cursor, Copilot) reuse a directory already chosen, falling back to
 * their preferred one.
 */
function chooseSkillDirs(targets: ToolId[], scope: Scope): Map<string, ToolId[]> {
  const readers = targets
    .map((id) => ({ id, layout: toolPaths(id, scope).agents }))
    .filter((r): r is { id: ToolId; layout: { kind: "skill"; dirs: string[] } } => r.layout?.kind === "skill")
    .sort((a, b) => a.layout.dirs.length - b.layout.dirs.length);

  const chosen: string[] = [];
  for (const { layout } of readers) {
    if (!layout.dirs.some((d) => chosen.includes(d))) chosen.push(layout.dirs[0]!);
  }
  const served = new Map<string, ToolId[]>();
  for (const dir of chosen) {
    served.set(dir, readers.filter((r) => r.layout.dirs.includes(dir)).map((r) => r.id));
  }
  return served;
}

/** Every agent file `spec` maps to at this scope (pure — no IO). */
export function agentFiles(spec: AgentSpec, scope: Scope): AgentFile[] {
  const files: AgentFile[] = [];
  for (const [dir, tools] of chooseSkillDirs(spec.targets, scope)) {
    const folder = join(scope.root, dir, spec.name);
    files.push({ path: join(folder, "SKILL.md"), tools, render: renderSkill });
    for (const [rel, contents] of Object.entries(spec.resources)) {
      files.push({ path: join(folder, ...rel.split("/")), tools, render: () => contents, executable: contents.startsWith("#!"), resource: true });
    }
  }
  for (const id of spec.targets) {
    const layout = toolPaths(id, scope).agents;
    if (layout?.kind !== "rule") continue;
    files.push({
      path: join(scope.root, layout.dir, `${spec.name}.md`),
      tools: [id],
      render: layout.flavor === "windsurf" ? renderWindsurfRule : renderRule,
    });
  }
  return files;
}

/** MCP config files the targets use at this scope, grouped by path. */
export function mcpFiles(targets: ToolId[], scope: Scope): { path: string; tools: ToolId[] }[] {
  const byPath = new Map<string, ToolId[]>();
  for (const id of targets) {
    const path = mcpConfigPath(id, scope);
    if (path) byPath.set(path, [...(byPath.get(path) ?? []), id]);
  }
  return [...byPath].map(([path, tools]) => ({ path, tools }));
}

/** Files from earlier perezdev releases that `spec` may have left behind (user scope only). */
export function legacyFiles(spec: AgentSpec, scope: Scope): string[] {
  if (scope.kind !== "user") return [];
  return spec.targets.flatMap((id) => tool(id).legacy?.(spec.name) ?? []).map((rel) => join(scope.root, rel));
}

/**
 * Accumulates writes for a batch. Reads go through an overlay of pending
 * writes, so two agents merging servers into the same MCP config compose
 * instead of the second clobbering the first.
 */
export class Planner {
  private pending = new Map<string, PlannedFile>();

  constructor(private readonly scope: Scope) {}

  private async current(path: string): Promise<string | null> {
    const queued = this.pending.get(path);
    return queued ? queued.contents : readIfExists(path);
  }

  private async put(path: string, contents: string, tools: ToolId[], kind: PlannedFile["kind"], executable = false): Promise<void> {
    const queued = this.pending.get(path);
    const previous = queued ? queued.previous : await readIfExists(path);
    const merged = queued ? [...new Set([...queued.tools, ...tools])] : tools;
    this.pending.set(path, { path, contents, previous, tools: merged, kind, ...(executable ? { executable } : {}) });
  }

  /** Queue an agent's files plus the MCP servers it depends on. */
  async addAgent(spec: AgentSpec): Promise<void> {
    for (const file of agentFiles(spec, this.scope)) {
      await this.put(file.path, file.render(spec), file.tools, "agent", file.executable);
    }
    if (spec.mcpDependencies.length > 0) await this.addMcp(spec.mcpDependencies, spec.targets);
  }

  /** Queue MCP servers into every target's config at this scope. */
  async addMcp(deps: McpDependency[], targets: ToolId[]): Promise<void> {
    for (const { path, tools } of mcpFiles(targets, this.scope)) {
      await this.put(path, mcpFormat(path).merge(path, await this.current(path), deps), tools, "mcp");
    }
  }

  /** Queue removal of servers from one MCP config ("" contents: nothing left, delete the file). */
  async pruneMcpAt(path: string, names: string[]): Promise<void> {
    const pruned = mcpFormat(path).prune(path, await this.current(path), names);
    if (pruned !== null) await this.put(path, pruned, [], "mcp");
  }

  /** Queue perezdev's block in a shared file (null removes it). "" contents mean the file should go. */
  async putSection(path: string, body: string | null, preamble: string): Promise<void> {
    const next = upsertSection(await this.current(path), body, preamble);
    if (next !== null) await this.put(path, next, [], "section");
  }

  /** Planned files that actually change something. */
  files(): PlannedFile[] {
    return [...this.pending.values()].filter((f) => !sameText(f.previous, f.contents));
  }

  /** Every planned path, changed or not (used to tell stale files from current ones). */
  paths(): Set<string> {
    return new Set(this.pending.keys());
  }
}
