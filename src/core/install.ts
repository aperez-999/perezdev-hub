import { chmod } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { agentFiles, legacyFiles, mcpFiles, Planner, type PlannedFile } from "../adapters/plan.js";
import { mcpFormat } from "../adapters/mcp-config.js";
import { isOwned } from "../adapters/render.js";
import { mcpConfigPath, supportsAgents, toolName, toolPaths } from "../adapters/tools.js";
import type { RegistryMcpServer } from "../registry/index.js";
import {
  atomicWriteValidated,
  readIfExists,
  removeDirIfEmpty,
  removeIfExists,
  withRollback,
} from "../util/fs-safe.js";
import { TOOL_IDS, type AgentSpec, type McpDependency, type ToolId } from "./agent-spec.js";
import { contextSections } from "./context.js";
import { readLock, writeLock, type Lockfile } from "./lockfile.js";
import { assertSafeMcpLaunch } from "./mcp-allow.js";
import { lockfilePath, type Scope } from "./scope.js";

/** An MCP server installed on its own (no owning agent). */
export interface StandaloneMcp {
  id: string;
  name: string;
  dependency: McpDependency;
  targets: ToolId[];
}

/** What a command wants to change in a scope. Everything else in the lockfile is left alone. */
export interface Changes {
  agents?: AgentSpec[];
  removeAgents?: string[];
  mcp?: StandaloneMcp[];
  removeMcp?: string[];
  /** Turn the managed AGENTS.md section on or off (project scope). */
  agentsMd?: boolean;
}

export interface Skipped {
  name: string;
  tool: ToolId;
  reason: string;
}

/** A fully computed change set: preview it, then {@link applyPlan} it. */
export interface Plan {
  scope: Scope;
  next: Lockfile;
  /** Files whose contents change. */
  writes: PlannedFile[];
  /** perezdev-owned files that are no longer wanted. */
  deletes: string[];
  /** Existing files in the way that perezdev did not create. Applying needs `force`. */
  conflicts: string[];
  skipped: Skipped[];
}

/** Convert a catalog MCP server into the dependency form tools store. */
export function toDependency(server: RegistryMcpServer): McpDependency {
  return { name: server.id, command: server.command, args: server.args, env: server.env ?? {} };
}

export function toStandalone(server: RegistryMcpServer, targets: ToolId[]): StandaloneMcp {
  return { id: server.id, name: server.name, dependency: toDependency(server), targets };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** (config path → server names) for everything a lockfile puts into MCP configs. */
function mcpPairs(lock: Lockfile, scope: Scope): Map<string, Set<string>> {
  const pairs = new Map<string, Set<string>>();
  const add = (targets: ToolId[], names: string[]) => {
    for (const { path } of mcpFiles(targets, scope)) {
      const set = pairs.get(path) ?? new Set<string>();
      for (const n of names) set.add(n);
      pairs.set(path, set);
    }
  };
  for (const { spec } of Object.values(lock.agents)) add(spec.targets, spec.mcpDependencies.map((d) => d.name));
  for (const m of Object.values(lock.mcpServers)) add(m.targets, [m.id]);
  return pairs;
}

/** Build the next lockfile, keeping only targets that can actually hold each item at this scope. */
function nextLock(prev: Lockfile, scope: Scope, changes: Changes, now: string, skipped: Skipped[]): Lockfile {
  const next = structuredClone(prev);

  for (const spec of changes.agents ?? []) {
    for (const dep of spec.mcpDependencies) assertSafeMcpLaunch(dep.command, dep.args);
    const targets = spec.targets.filter((t) => {
      if (supportsAgents(t, scope)) return true;
      skipped.push({ name: spec.name, tool: t, reason: `${toolName(t)} has no per-agent location at ${scope.kind} scope` });
      return false;
    });
    if (targets.length === 0) {
      throw new Error(
        `'${spec.name}': none of ${spec.targets.join(", ")} can hold agents at ${scope.kind} scope` +
          (scope.kind === "user" ? " — run it inside a project instead" : ""),
      );
    }
    const resourceCount = Object.keys(spec.resources).length;
    if (resourceCount > 0) {
      for (const t of targets.filter((t) => toolPaths(t, scope).agents?.kind === "rule")) {
        skipped.push({ name: spec.name, tool: t, reason: `gets the instructions only; ${resourceCount} bundled file(s) need a skills-capable tool` });
      }
    }
    if (spec.mcpDependencies.length > 0) {
      for (const t of targets.filter((t) => !mcpConfigPath(t, scope))) {
        skipped.push({ name: spec.name, tool: t, reason: `MCP servers for ${toolName(t)} aren't managed at ${scope.kind} scope` });
      }
    }
    const narrowed = { ...spec, targets };
    const prevEntry = prev.agents[spec.name];
    next.agents[spec.name] = {
      spec: narrowed,
      installedAt: prevEntry && sameJson(prevEntry.spec, narrowed) ? prevEntry.installedAt : now,
    };
  }
  for (const name of changes.removeAgents ?? []) delete next.agents[name];

  for (const m of changes.mcp ?? []) {
    assertSafeMcpLaunch(m.dependency.command, m.dependency.args);
    const capable = m.targets.filter((t) => {
      if (mcpConfigPath(t, scope)) return true;
      skipped.push({ name: m.id, tool: t, reason: `MCP servers for ${toolName(t)} aren't managed at ${scope.kind} scope` });
      return false;
    });
    if (capable.length === 0) continue;
    const prevEntry = prev.mcpServers[m.id];
    // Union with recorded targets so a narrower re-install doesn't orphan servers.
    const targets = [...new Set([...(prevEntry?.targets ?? []), ...capable])];
    const unchanged = prevEntry && sameJson(prevEntry.dependency, m.dependency) && sameJson(prevEntry.targets, targets);
    next.mcpServers[m.id] = { id: m.id, name: m.name, dependency: m.dependency, targets, installedAt: unchanged ? prevEntry.installedAt : now };
  }
  for (const id of changes.removeMcp ?? []) delete next.mcpServers[id];

  if (changes.agentsMd !== undefined) {
    if (scope.kind !== "project") throw new Error("the AGENTS.md section is per project — run this inside a repository");
    if (changes.agentsMd) next.agentsMd = true;
    else delete next.agentsMd;
  }
  return next;
}

/** Compute every write and delete `changes` imply, without touching disk. */
export async function planChanges(scope: Scope, changes: Changes, now: string = new Date().toISOString()): Promise<Plan> {
  const prev = await readLock(scope);
  const skipped: Skipped[] = [];
  const next = nextLock(prev, scope, changes, now, skipped);
  const planner = new Planner(scope);

  const touchedAgents = new Set([...(changes.agents ?? []).map((s) => s.name), ...(changes.removeAgents ?? [])]);
  for (const name of touchedAgents) {
    const spec = next.agents[name]?.spec;
    if (spec) await planner.addAgent(spec);
  }
  for (const m of changes.mcp ?? []) {
    const entry = next.mcpServers[m.id];
    if (entry) await planner.addMcp([entry.dependency], entry.targets);
  }

  // Servers no longer referenced by anything in the lockfile come out of their configs.
  const before = mcpPairs(prev, scope);
  const after = mcpPairs(next, scope);
  for (const [path, names] of before) {
    const gone = [...names].filter((n) => !after.get(path)?.has(n));
    if (gone.length > 0) await planner.pruneMcpAt(path, gone);
  }

  // Files the lockfile already records are perezdev's, marker or not (verbatim skills, resources).
  const managed = new Set(Object.values(prev.agents).flatMap(({ spec }) => agentFiles(spec, scope).map((f) => f.path)));

  const deletes: string[] = [];
  const keep = planner.paths();
  for (const name of touchedAgents) {
    const oldSpec = prev.agents[name]?.spec;
    const newSpec = next.agents[name]?.spec;
    if (!oldSpec && !newSpec) continue;
    const candidates = [
      ...(oldSpec ? agentFiles(oldSpec, scope).map((f) => f.path) : []),
      ...legacyFiles((newSpec ?? oldSpec)!, scope),
    ];
    for (const path of new Set(candidates)) {
      if (keep.has(path)) continue;
      const content = await readIfExists(path);
      if (content !== null && (managed.has(path) || isOwned(content))) deletes.push(path);
    }
  }

  // Shared files get their block refreshed on every change, so commands never go stale silently.
  if (prev.agentsMd || next.agentsMd) {
    // Only when the section is first turned on may machine-detected Claude Code create CLAUDE.md.
    const enabling = changes.agentsMd === true && !prev.agentsMd;
    for (const section of await contextSections(scope, next, { enabling })) {
      await planner.putSection(section.path, section.body, section.preamble);
    }
  }

  const planned = planner.files();
  // A shared file left with nothing of the user's in it (empty MCP config, preamble-only AGENTS.md) is removed.
  const emptied = (w: PlannedFile) => w.kind !== "agent" && w.contents === "";
  for (const w of planned.filter((w) => emptied(w) && w.previous !== null)) deletes.push(w.path);
  const writes = planned.filter((w) => !emptied(w));
  const conflicts = writes
    .filter((w) => w.kind === "agent" && w.previous !== null && !managed.has(w.path) && !isOwned(w.previous))
    .map((w) => w.path);
  return { scope, next, writes, deletes, conflicts, skipped };
}

export class ConflictError extends Error {
  constructor(readonly paths: string[]) {
    super(
      `refusing to overwrite file(s) perezdev didn't create:\n  ${paths.join("\n  ")}\n` +
        `Rename the agent, move those files, or pass --force to overwrite (a backup is kept in ~/.config/perezdev/backups).`,
    );
  }
}

/** Every directory a tool reads agents from at user scope — emptied ones are left in place. */
function toolRoots(scope: Scope): Set<string> {
  const roots = new Set<string>([scope.root]);
  for (const id of TOOL_IDS) {
    const layout = toolPaths(id, scope).agents;
    for (const d of layout?.kind === "skill" ? layout.dirs : layout ? [layout.dir] : []) {
      let dir = join(scope.root, d);
      // Also keep the parents (`.claude`, `.github`, `Documents/Cline`).
      while (dir.startsWith(scope.root + sep)) {
        roots.add(dir);
        dir = dirname(dir);
      }
    }
  }
  return roots;
}

/** Confirm each written file actually holds the expected content — no false passes. */
async function verifyWritten(writes: PlannedFile[]): Promise<void> {
  const failures: string[] = [];
  for (const f of writes) {
    const onDisk = await readIfExists(f.path);
    if (onDisk === null) failures.push(`${f.path} (not written)`);
    else if (onDisk !== f.contents) failures.push(`${f.path} (content mismatch)`);
  }
  if (failures.length > 0) throw new Error(`install verification failed:\n  ${failures.join("\n  ")}`);
}

/**
 * Write a plan: all files plus the lockfile, all-or-nothing. Every touched path
 * is backed up first and restored if anything fails part-way.
 */
export async function applyPlan(plan: Plan, opts: { force?: boolean; now?: string } = {}): Promise<void> {
  if (plan.conflicts.length > 0 && !opts.force) throw new ConflictError(plan.conflicts);
  const now = opts.now ?? new Date().toISOString();
  const lock = lockfilePath(plan.scope);
  const paths = [...plan.writes.map((w) => w.path), ...plan.deletes, lock];
  await withRollback(paths, now, async () => {
    for (const w of plan.writes) {
      await atomicWriteValidated(w.path, w.contents, w.kind === "mcp" ? mcpFormat(w.path).validate : undefined);
      if (w.executable) await chmod(w.path, 0o755);
    }
    // In a repo, emptied folders are clutter git won't even track; in $HOME, a tool's own directories stay.
    const roots = plan.scope.kind === "user" ? toolRoots(plan.scope) : new Set([plan.scope.root]);
    for (const path of plan.deletes) {
      await removeIfExists(path);
      // Clean up folders the delete emptied.
      for (let dir = dirname(path); !roots.has(dir) && dir.startsWith(plan.scope.root + sep); dir = dirname(dir)) {
        if (!(await removeDirIfEmpty(dir))) break;
      }
    }
    await verifyWritten(plan.writes);
    await writeLock(plan.scope, plan.next);
  });
}

/** Plan + apply in one step. Returns the plan that was applied. */
export async function commit(scope: Scope, changes: Changes, opts: { force?: boolean; now?: string } = {}): Promise<Plan> {
  const plan = await planChanges(scope, changes, opts.now);
  await applyPlan(plan, opts);
  return plan;
}

/** Bump the patch component of a semver-ish version string (x.y.z). */
export function bumpPatch(version: string): string {
  const parts = version.split(".");
  const patch = Number(parts[2] ?? "0");
  if (parts.length < 3 || Number.isNaN(patch)) return `${version}.1`;
  return `${parts[0]}.${parts[1]}.${patch + 1}`;
}
