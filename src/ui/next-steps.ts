import pc from "picocolors";
import { basename, dirname } from "node:path";
import { agentFiles, mcpFiles } from "../adapters/plan.js";
import { toolName } from "../adapters/tools.js";
import type { ToolId } from "../core/agent-spec.js";
import type { Lockfile } from "../core/lockfile.js";
import { LAUNCHER_HELP, readiness, type Readiness } from "../core/readiness.js";
import { displayPath, PROJECT_LOCKFILE, type Scope } from "../core/scope.js";
import { p } from "./prompts.js";

/** How each tool picks up what perezdev wrote. Kept to what the tools' docs promise. */
const ACTIVATION: Record<ToolId, string> = {
  "claude-code": "new session; skills load when a task matches, or run /<skill-name>",
  codex: "restart it; skills load when a task matches",
  cursor: "new chat; skills load when a task matches",
  copilot: "agent mode; skills load when a task matches",
  cline: "rules apply to every task",
  roo: "rules apply to every task",
  windsurf: "rules load when a task matches their description",
};

/** An example request for an installed agent, so "try it" is concrete. */
function examplePrompt(names: string[]): string | null {
  const examples: [RegExp, string][] = [
    [/review/, "review my staged changes"],
    [/commit/, "write a commit message for my staged changes"],
    [/pr-|pull/, "describe this branch as a pull request"],
    [/test/, "add tests for <file>"],
    [/debug/, "this test fails: <paste the error>"],
    [/doc/, "document <module>"],
  ];
  for (const [re, text] of examples) if (names.some((n) => re.test(n))) return text;
  return names[0] ? `use the ${names[0]} skill on <task>` : null;
}

interface Placement {
  /** Folders holding its skills or rules, e.g. ".claude/skills", ".clinerules". */
  agents: Set<string>;
  /** Its MCP config, when perezdev manages one for it. */
  mcp?: string;
}

/** Tools in use, with where each reads its agents and MCP servers from. */
function placements(scope: Scope, lock: Lockfile): Map<ToolId, Placement> {
  const out = new Map<ToolId, Placement>();
  const entry = (id: ToolId): Placement => {
    if (!out.has(id)) out.set(id, { agents: new Set() });
    return out.get(id)!;
  };
  for (const { spec } of Object.values(lock.agents)) {
    for (const file of agentFiles(spec, scope).filter((f) => !f.resource)) {
      // `<dir>/<name>/SKILL.md` → `<dir>`; `<dir>/<name>.md` → `<dir>`.
      const folder = dirname(basename(file.path) === "SKILL.md" ? dirname(file.path) : file.path);
      for (const id of file.tools) entry(id).agents.add(displayPath(scope, folder));
    }
  }
  const mcpTargets = [
    ...Object.values(lock.agents).filter((a) => a.spec.mcpDependencies.length > 0).flatMap((a) => a.spec.targets),
    ...Object.values(lock.mcpServers).flatMap((m) => m.targets),
  ];
  for (const { path, tools } of mcpFiles([...new Set(mcpTargets)], scope)) for (const id of tools) entry(id).mcp = displayPath(scope, path);
  return out;
}

/** Commands to commit the generated files, grouped by top-level path. */
function gitAdd(state: Readiness): string | null {
  const roots = [...new Set(state.uncommitted.map((path) => (path.includes("/") ? `${path.split("/")[0]}/` : path)))];
  return roots.length > 0 ? `git add ${roots.join(" ")}` : null;
}

/** What to fix before MCP servers can start. Empty when nothing is missing. */
function prerequisites(state: Readiness): string[] {
  return [
    ...state.missingLaunchers.map((m) => `${pc.yellow("!")} ${m.bin} isn't on PATH (needed by ${m.servers.join(", ")}) — ${LAUNCHER_HELP[m.bin] ?? `install ${m.bin}`}`),
    ...state.missingEnv.map((e) => `${pc.yellow("!")} ${e.name} isn't set (needed by ${e.servers.join(", ")}) — export it where your editor or agent starts`),
  ];
}

/**
 * After a change: where things went, how to try them, what's still needed, and
 * how to share it. `full` adds the per-tool map (used by `init`).
 */
export async function printNextSteps(scope: Scope, lock: Lockfile, opts: { full?: boolean } = {}): Promise<void> {
  const state = await readiness(scope, lock);
  const tools = placements(scope, lock);

  if (opts.full && tools.size > 0) {
    const width = Math.max(...[...tools.keys()].map((id) => toolName(id).length));
    const lines = [...tools].map(([id, t]) => {
      const where = [t.agents.size > 0 ? [...t.agents].join(", ") : null, t.mcp].filter(Boolean).join(" · ");
      return `${toolName(id).padEnd(width)}  ${where}`;
    });
    if (lock.agentsMd) lines.push(`${"Every tool".padEnd(width)}  AGENTS.md (Commands section)`);
    if (state.ci) lines.push(`${"CI".padEnd(width)}  perezdev doctor on every pull request`);
    p.note(lines.join("\n"), "Where it went");
  }

  const names = Object.keys(lock.agents);
  const example = examplePrompt(names);
  const tryLines = [...tools.keys()].map((id) => `${toolName(id)}: ${ACTIVATION[id]}`);
  if (example) tryLines.push("", `Then ask for something a skill covers, e.g. ${pc.cyan(`"${example}"`)}`);
  const mcpTools = [...tools].filter(([, t]) => t.mcp).map(([id]) => id);
  if (mcpTools.includes("claude-code") && scope.kind === "project") tryLines.push("Claude Code asks once to approve the servers in .mcp.json (or run /mcp).");
  if (mcpTools.includes("codex") && scope.kind === "project") tryLines.push("Codex only loads .codex/config.toml once you trust this project.");
  if (tryLines.length > 0) p.note(tryLines.join("\n"), "Try it");

  const missing = prerequisites(state);
  if (missing.length > 0) p.note(missing.join("\n"), "Before the MCP servers start");

  if (scope.kind === "project") {
    const share: string[] = [];
    for (const path of state.ignored) share.push(`${pc.yellow("!")} ${path} is gitignored — teammates won't get it`);
    const add = gitAdd(state);
    if (add) share.push(`${add}`, `git commit -m "chore: add AI agent setup (perezdev)"`);
    if (!state.ci) share.push(`perezdev ci ${pc.dim("— fail pull requests when these files drift")}`);
    if (share.length > 0) p.note(share.join("\n"), `Share it ${pc.dim(`(${PROJECT_LOCKFILE} + generated files)`)}`);
  }
}

/** One-line hints for `status`: the most useful next actions. */
export async function statusHints(scope: Scope, lock: Lockfile): Promise<string[]> {
  const state = await readiness(scope, lock);
  const hints = prerequisites(state);
  if (scope.kind === "project") {
    for (const path of state.ignored) hints.push(`${pc.yellow("!")} ${path} is gitignored — teammates won't get it`);
    if (state.uncommitted.length > 0) hints.push(`${state.uncommitted.length} generated file(s) not committed — ${gitAdd(state)}`);
    if (!state.ci) hints.push(`no CI check yet — perezdev ci`);
  }
  return hints;
}
