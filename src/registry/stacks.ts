/**
 * A Stack is the hub's signature feature: a curated, one-command bundle of
 * skill presets + MCP servers installed together across all detected tools.
 * `skillPresets` reference ids in core/presets.ts; `mcpServers` reference ids
 * in registry/mcp-servers.ts. Both are validated in registry/index.ts.
 */
export interface Stack {
  id: string;
  summary: string;
  skillPresets: string[];
  mcpServers: string[];
  tags: string[];
}

export const STACKS: Stack[] = [
  {
    id: "review",
    summary: "Code review essentials: reviewer, debugger, tests + git/github context.",
    skillPresets: ["code-reviewer", "debugger", "test-writer"],
    mcpServers: ["git", "github"],
    tags: ["quality", "review"],
  },
  {
    id: "backend",
    summary: "Backend dev: reviewer, tests, debugger + Postgres and filesystem.",
    skillPresets: ["code-reviewer", "test-writer", "debugger"],
    mcpServers: ["postgres", "filesystem"],
    tags: ["backend", "api", "database"],
  },
  {
    id: "frontend",
    summary: "Frontend dev: reviewer, docs, tests + filesystem and fetch.",
    skillPresets: ["code-reviewer", "doc-writer", "test-writer"],
    mcpServers: ["filesystem", "fetch"],
    tags: ["frontend", "ui"],
  },
  {
    id: "ship",
    summary: "Release flow: commit + PR + release notes with git/github context.",
    skillPresets: ["commit-helper", "pr-describer", "release-notes"],
    mcpServers: ["git", "github"],
    tags: ["release", "delivery"],
  },
  {
    id: "plan",
    summary: "Up-front design: planner + architect with filesystem context.",
    skillPresets: ["planner", "architect"],
    mcpServers: ["filesystem"],
    tags: ["planning", "design"],
  },
];
