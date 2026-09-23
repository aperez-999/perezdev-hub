/** A catalog MCP server perezdev can install into a tool's MCP config. */
export interface RegistryMcpServer {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  tags: string[];
  /** Fixed environment for the server process. Secrets are never stored here — see `needs`. */
  env?: Record<string, string>;
  /** Environment variables the server reads from your shell (tokens, connection strings). */
  needs?: string[];
}

/**
 * Curated stdio servers, each a maintained package (checked against npm/PyPI
 * and the publisher's repo — the original @modelcontextprotocol reference
 * servers for GitHub, Postgres, Puppeteer, etc. were archived in 2025). `id`
 * doubles as the server key written into tool configs.
 */
export const MCP_SERVERS: RegistryMcpServer[] = [
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Read and write files under the project directory.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
    tags: ["files", "core"],
  },
  {
    id: "git",
    name: "Git",
    description: "Inspect history, diffs, and branches of the current repo.",
    command: "uvx",
    args: ["mcp-server-git"],
    tags: ["git", "vcs"],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Issues, pull requests, and Actions via GitHub's official server (Docker).",
    command: "docker",
    args: ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
    tags: ["git", "github", "api"],
    needs: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
  },
  {
    id: "context7",
    name: "Context7",
    description: "Current, version-specific library docs pulled into the prompt.",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
    tags: ["docs", "core"],
  },
  {
    id: "fetch",
    name: "Fetch",
    description: "Fetch a URL and return its content as markdown.",
    command: "uvx",
    args: ["mcp-server-fetch"],
    tags: ["web", "http"],
  },
  {
    id: "playwright",
    name: "Playwright",
    description: "Drive a real browser: navigate, click, read the accessibility tree.",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
    tags: ["web", "testing", "frontend"],
  },
  {
    id: "postgres",
    name: "Postgres",
    description: "Query and analyze a PostgreSQL database (restricted, read-only mode).",
    command: "uvx",
    args: ["postgres-mcp", "--access-mode=restricted"],
    tags: ["database", "sql", "backend"],
    needs: ["DATABASE_URI"],
  },
  {
    id: "redis",
    name: "Redis",
    description: "Inspect keys and data structures in a Redis instance (Redis's official server).",
    command: "uvx",
    args: ["--from", "redis-mcp-server@latest", "redis-mcp-server"],
    tags: ["database", "cache"],
    needs: ["REDIS_HOST"],
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Read Sentry issues, events, and stack traces.",
    command: "npx",
    args: ["-y", "@sentry/mcp-server"],
    tags: ["observability", "errors"],
    needs: ["SENTRY_ACCESS_TOKEN"],
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Web search via the Brave Search API.",
    command: "npx",
    args: ["-y", "@brave/brave-search-mcp-server"],
    tags: ["web", "search"],
    needs: ["BRAVE_API_KEY"],
  },
  {
    id: "memory",
    name: "Memory",
    description: "Persistent knowledge-graph memory across sessions.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    tags: ["memory"],
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description: "Structured multi-step reasoning for harder tasks.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    tags: ["reasoning"],
  },
  {
    id: "time",
    name: "Time",
    description: "Current time and timezone conversion.",
    command: "uvx",
    args: ["mcp-server-time"],
    tags: ["utility"],
  },
];
