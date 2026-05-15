import type { ProjectScan } from "./scan.js";
import { getMcpServer, type RegistryMcpServer } from "../registry/index.js";

// A generated (not preset) agent tailored to the scan; becomes an AgentSpec at install time.
export interface AgentProposal {
  name: string;
  role: string;
  description: string;
  allowedTools: string[];
  reason: string;
  score: number;
}

export interface McpSuggestion {
  server: RegistryMcpServer;
  reason: string;
  score: number;
}

export interface Recommendations {
  agents: AgentProposal[];
  mcp: McpSuggestion[];
}

const FRONTEND = ["react", "next", "vue", "svelte", "angular"];
const BACKEND = ["express", "fastify", "nest", "koa", "fastapi", "django", "flask"];

/** Build project-tailored, generated recommendations. Deterministic, no LLM. */
export function recommend(
  scan: ProjectScan,
  installedAgents: Set<string>,
  installedMcp: Set<string>,
): Recommendations {
  const fw = scan.frameworks[0];
  const stack = [scan.languages.join("/"), scan.frameworks.join("/")].filter(Boolean).join(" ");
  const subject = stack || "your code";
  const prefix = fw ? `${fw}-` : "";

  const agents: AgentProposal[] = [];
  const addAgent = (p: AgentProposal) => {
    if (!installedAgents.has(p.name)) agents.push(p);
  };

  addAgent({
    name: `${prefix}reviewer`.replace(/^-/, "") || "reviewer",
    role: `a ${fw ?? "code"} reviewer`,
    description: `reviewing ${subject} changes for bugs, security, and maintainability`,
    allowedTools: ["Read", "Grep", "Bash"],
    reason: "review your changes before they ship",
    score: 60,
  });

  if (scan.languages.length > 0) {
    addAgent({
      name: `${prefix}test-writer`,
      role: "a test engineer",
      description: `writing and improving tests for ${subject}`,
      allowedTools: ["Read", "Grep", "Write", "Bash"],
      reason: scan.hasTests ? "extend your existing test coverage" : "you have no tests yet",
      score: scan.hasTests ? 58 : 50,
    });
    addAgent({
      name: "debugger",
      role: "a methodical debugger",
      description: `investigating failures and bugs in ${subject}`,
      allowedTools: ["Read", "Grep", "Bash"],
      reason: "track down failures by root cause",
      score: 48,
    });
  }

  if (scan.git) {
    addAgent({
      name: "commit-helper",
      role: "an assistant that writes clear conventional-commit messages",
      description: "summarizing staged changes into a clear commit message",
      allowedTools: ["Bash", "Read"],
      reason: "git repo — write better commits",
      score: 56,
    });
    addAgent({
      name: "pr-describer",
      role: "an assistant that writes pull-request descriptions",
      description: "summarizing a branch's changes into a reviewable PR description",
      allowedTools: ["Bash", "Read"],
      reason: "git repo — draft PR descriptions",
      score: 46,
    });
  }

  if (scan.frameworks.some((f) => BACKEND.includes(f))) {
    addAgent({
      name: `${prefix}api-tester`,
      role: "an API test engineer",
      description: `testing ${fw ?? "the"} endpoints for validation, status codes, and error handling`,
      allowedTools: ["Read", "Grep", "Write", "Bash"],
      reason: "API/backend project",
      score: 52,
    });
  }
  if (scan.frameworks.some((f) => FRONTEND.includes(f))) {
    addAgent({
      name: `${prefix}doc-writer`,
      role: "a technical writer",
      description: `documenting ${fw ?? "frontend"} components and their usage`,
      allowedTools: ["Read", "Grep", "Write"],
      reason: "frontend project — document components",
      score: 44,
    });
  }

  // MCP suggestions — concrete servers, ranked by project fit.
  const mcp: McpSuggestion[] = [];
  const addMcp = (id: string, reason: string, score: number) => {
    if (installedMcp.has(id)) return;
    const server = getMcpServer(id);
    if (server && !mcp.some((m) => m.server.id === id)) mcp.push({ server, reason, score });
  };
  addMcp("filesystem", "give agents access to your files", 40);
  if (scan.git) {
    addMcp("git", "git repo — inspect history and diffs", 54);
    addMcp("github", "GitHub workflows (issues, PRs)", 44);
  }
  for (const db of scan.databases) {
    if (db === "postgres") addMcp("postgres", "Postgres dependency detected", 62);
    if (db === "sqlite") addMcp("sqlite", "SQLite detected", 62);
  }
  if (scan.frameworks.some((f) => FRONTEND.includes(f) || BACKEND.includes(f))) {
    addMcp("fetch", "web/API project — fetch pages and endpoints", 46);
  }

  agents.sort((a, b) => b.score - a.score);
  mcp.sort((a, b) => b.score - a.score);
  return { agents, mcp };
}
