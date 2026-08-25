/** A catalog MCP server the hub can install into a tool's MCP config. */
export interface RegistryMcpServer {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  tags: string[];
  /** Environment variables the server needs (e.g. API tokens). */
  env?: Record<string, string>;
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
    id: "gitlab",
    name: "GitLab",
    description: "Issues, MRs, and projects via the GitLab API.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-gitlab"],
    tags: ["git", "gitlab", "api"],
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
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description: "Structured multi-step reasoning for harder tasks.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    tags: ["reason", "core"],
  },
  {
    id: "memory",
    name: "Memory",
    description: "Persistent knowledge-graph memory across sessions.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    tags: ["memory", "core"],
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Web search via the Brave Search API.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    tags: ["web", "search"],
  },
  {
    id: "docker",
    name: "Docker",
    description: "Manage containers, images, and Docker environments.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-docker"],
    tags: ["docker", "devops"],
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    description: "Drive a headless browser for automation and scraping.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    tags: ["web", "automation"],
  },
  {
    id: "redis",
    name: "Redis",
    description: "Query and inspect a Redis instance.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-redis"],
    tags: ["database", "cache"],
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Read Sentry issues and error context.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sentry"],
    tags: ["observability", "errors"],
  },
];
