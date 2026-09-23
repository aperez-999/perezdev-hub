/**
 * A Stack is a curated, one-command bundle of skill presets + MCP servers
 * installed together.
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
    summary: "Backend dev: reviewer, tests, debugger + Postgres and Context7 docs.",
    skillPresets: ["code-reviewer", "test-writer", "debugger"],
    mcpServers: ["postgres", "context7"],
    tags: ["backend", "api", "database"],
  },
  {
    id: "frontend",
    summary: "Frontend dev: reviewer, docs, tests + Playwright and Context7 docs.",
    skillPresets: ["code-reviewer", "doc-writer", "test-writer"],
    mcpServers: ["playwright", "context7"],
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
    summary: "Up-front design: planner + architect with Context7 docs.",
    skillPresets: ["planner", "architect"],
    mcpServers: ["context7"],
    tags: ["planning", "design"],
  },
];
