import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { TOOL_IDS, type ToolId } from "../core/agent-spec.js";
import { home } from "../core/config.js";
import { isCursorHost } from "../core/host.js";
import type { Scope } from "../core/scope.js";
import { exists } from "../util/fs-safe.js";

/**
 * Where each tool reads agents and MCP servers from. This table is the whole
 * "adapter" layer: supporting a new tool means adding one entry here. Every
 * path is relative to the scope root ($HOME or the repo root) and was checked
 * against the tool's documentation — keep the source links current.
 */

/** How an agent is materialized for a tool. */
export type AgentLayout =
  /**
   * An Agent Skills folder: `<dir>/<name>/SKILL.md`. `dirs` lists every skills
   * directory the tool loads, preferred first; tools that share a directory get
   * a single copy (see plan.ts).
   */
  | { kind: "skill"; dirs: string[] }
  /** One markdown file per agent: `<dir>/<name>.md`. */
  | { kind: "rule"; dir: string; flavor: "plain" | "windsurf" };

export interface ScopedPaths {
  /** Missing → the tool has no per-agent location at this scope. */
  agents?: AgentLayout;
  /** MCP config: JSON with `mcpServers`, or TOML (`.toml`) with `[mcp_servers.*]`. Missing → not managed. */
  mcp?: string;
  /** Paths whose presence means the tool is in use at this scope. */
  signals: string[];
}

export interface ToolDef {
  id: ToolId;
  name: string;
  /** VS Code extension id prefixes that also count as "installed" (user scope). */
  extensions?: string[];
  docs: string;
  user: ScopedPaths;
  project: ScopedPaths;
  /** Pre-0.3 locations perezdev used to write; cleaned up when an agent is re-applied. */
  legacy?: (name: string) => string[];
}

export const TOOLS: Record<ToolId, ToolDef> = {
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    docs: "https://code.claude.com/docs/en/skills",
    user: { agents: { kind: "skill", dirs: [".claude/skills"] }, mcp: ".claude.json", signals: [".claude"] },
    project: { agents: { kind: "skill", dirs: [".claude/skills"] }, mcp: ".mcp.json", signals: [".claude", "CLAUDE.md", ".mcp.json"] },
  },
  codex: {
    id: "codex",
    name: "Codex",
    docs: "https://learn.chatgpt.com/docs/build-skills",
    // MCP: https://developers.openai.com/codex/mcp — project config applies once the project is trusted.
    user: { agents: { kind: "skill", dirs: [".agents/skills"] }, mcp: ".codex/config.toml", signals: [".codex"] },
    project: { agents: { kind: "skill", dirs: [".agents/skills"] }, mcp: ".codex/config.toml", signals: [".codex", ".agents"] },
    legacy: (name) => [`.codex/prompts/${name}.md`],
  },
  cursor: {
    id: "cursor",
    name: "Cursor",
    docs: "https://cursor.com/docs/context/skills",
    user: { agents: { kind: "skill", dirs: [".agents/skills", ".claude/skills", ".cursor/skills"] }, mcp: ".cursor/mcp.json", signals: [".cursor"] },
    project: { agents: { kind: "skill", dirs: [".agents/skills", ".claude/skills", ".cursor/skills"] }, mcp: ".cursor/mcp.json", signals: [".cursor", ".cursorrules"] },
    legacy: (name) => [`.cursor/rules/${name}.mdc`],
  },
  copilot: {
    id: "copilot",
    name: "GitHub Copilot",
    extensions: ["github.copilot"],
    docs: "https://code.visualstudio.com/docs/copilot/customization/agent-skills",
    // MCP: https://code.visualstudio.com/docs/copilot/reference/mcp-configuration — the user-level
    // file lives in VS Code's profile folder (platform-specific), so only the workspace file is managed.
    user: { agents: { kind: "skill", dirs: [".agents/skills", ".claude/skills", ".copilot/skills"] }, signals: [".copilot", ".config/github-copilot"] },
    project: {
      agents: { kind: "skill", dirs: [".agents/skills", ".claude/skills", ".github/skills"] },
      mcp: ".vscode/mcp.json",
      signals: [".github/copilot-instructions.md", ".github/instructions", ".github/skills"],
    },
    legacy: (name) => [`.config/github-copilot/prompts/${name}.md`],
  },
  cline: {
    id: "cline",
    name: "Cline",
    extensions: ["saoudrizwan.claude-dev"],
    docs: "https://docs.cline.bot/customization/cline-rules",
    user: { agents: { kind: "rule", dir: "Documents/Cline/Rules", flavor: "plain" }, signals: [".cline", "Documents/Cline"] },
    project: { agents: { kind: "rule", dir: ".clinerules", flavor: "plain" }, signals: [".clinerules", ".cline"] },
    legacy: (name) => [`.clinerules/${name}.md`],
  },
  windsurf: {
    id: "windsurf",
    name: "Windsurf",
    docs: "https://docs.windsurf.com/windsurf/cascade/memories",
    // User-level rules are a single shared global_rules.md — no per-agent file to own.
    user: { signals: [".codeium/windsurf"] },
    project: { agents: { kind: "rule", dir: ".windsurf/rules", flavor: "windsurf" }, signals: [".windsurf", ".windsurfrules", ".devin"] },
    legacy: (name) => [`.codeium/windsurf/rules/${name}.md`],
  },
  roo: {
    id: "roo",
    name: "Roo Code",
    extensions: ["rooveterinaryinc.roo-cline"],
    docs: "https://roocodeinc.github.io/Roo-Code/features/custom-instructions",
    user: { agents: { kind: "rule", dir: ".roo/rules", flavor: "plain" }, signals: [".roo"] },
    project: { agents: { kind: "rule", dir: ".roo/rules", flavor: "plain" }, mcp: ".roo/mcp.json", signals: [".roo", ".roorules", ".roomodes"] },
  },
};

export function tool(id: ToolId): ToolDef {
  return TOOLS[id];
}

export function toolPaths(id: ToolId, scope: Scope): ScopedPaths {
  return TOOLS[id][scope.kind];
}

/** Display name for a tool id. */
export function toolName(id: ToolId): string {
  return TOOLS[id].name;
}

/** Can `id` hold agents at this scope? */
export function supportsAgents(id: ToolId, scope: Scope): boolean {
  return toolPaths(id, scope).agents !== undefined;
}

/** Absolute MCP config path for `id` at this scope, if perezdev manages one. */
export function mcpConfigPath(id: ToolId, scope: Scope): string | undefined {
  const rel = toolPaths(id, scope).mcp;
  return rel ? join(scope.root, rel) : undefined;
}

export interface Detection {
  id: ToolId;
  found: boolean;
  /** What was found (or what was looked for), for `perezdev status`. */
  detail: string;
}

async function hasExtension(prefixes: string[]): Promise<string | null> {
  for (const dir of [".vscode/extensions", ".cursor/extensions", ".windsurf/extensions"]) {
    const entries = await readdir(join(home(), dir)).catch(() => [] as string[]);
    const hit = entries.find((e) => prefixes.some((p) => e.startsWith(`${p}-`)));
    if (hit) return `~/${dir}/${hit}`;
  }
  return null;
}

/** Is the tool in use at this scope? User scope also checks editor extensions and the host app. */
export async function detect(id: ToolId, scope: Scope): Promise<Detection> {
  const paths = toolPaths(id, scope);
  for (const rel of paths.signals) {
    if (await exists(join(scope.root, rel))) return { id, found: true, detail: rel };
  }
  if (scope.kind === "user") {
    const def = TOOLS[id];
    const ext = def.extensions ? await hasExtension(def.extensions) : null;
    if (ext) return { id, found: true, detail: ext };
    if (id === "cursor" && isCursorHost()) return { id, found: true, detail: "running inside Cursor" };
  }
  return { id, found: false, detail: `no ${paths.signals[0] ?? "config"}` };
}

export async function detectAll(scope: Scope): Promise<Detection[]> {
  return Promise.all(TOOL_IDS.map((id) => detect(id, scope)));
}

/** Tool ids in use at this scope. */
export async function detectedTools(scope: Scope): Promise<ToolId[]> {
  return (await detectAll(scope)).filter((d) => d.found).map((d) => d.id);
}
