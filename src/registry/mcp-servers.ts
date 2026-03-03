/** A catalog MCP server the hub can install into a tool's MCP config. */
export interface RegistryMcpServer {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  tags: string[];
}

/**
 * Curated, installable MCP servers. `id` doubles as the server key written into
 * tool configs. Commands use `npx -y` so no global install is required.
 */
export const MCP_SERVERS: RegistryMcpServer[] = [
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Read and write files within allowed directories.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
    tags: ["files", "core"],
  },
  {
    id: "git",
    name: "Git",
    description: "Inspect history, diffs, and branches of a git repo.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-git"],
    tags: ["git", "vcs"],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Issues, PRs, and repo operations via the GitHub API.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    tags: ["git", "github", "api"],
  },
  {
    id: "postgres",
    name: "Postgres",
    description: "Query a PostgreSQL database (read-only by default).",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres"],
    tags: ["database", "sql", "backend"],
  },
  {
    id: "sqlite",
    name: "SQLite",
    description: "Query and inspect a local SQLite database.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sqlite"],
    tags: ["database", "sql"],
  },
  {
    id: "fetch",
    name: "Fetch",
    description: "Fetch a URL and return its content as markdown.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
    tags: ["web", "http"],
  },
  {
    id: "memory",
    name: "Memory",
    description: "Persistent knowledge-graph memory across sessions.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    tags: ["memory", "core"],
  },
];
