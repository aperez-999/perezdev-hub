import { parse as parseToml } from "smol-toml";
import type { McpDependency } from "../core/agent-spec.js";

/**
 * Reading and editing the files tools keep MCP servers in. JSON configs
 * (Claude Code, Cursor, Roo) hold a top-level `mcpServers` map; Codex keeps
 * `[mcp_servers.<name>]` tables in TOML. Either way perezdev only touches the
 * servers it's asked to and leaves every other byte alone, and a file it can't
 * parse is an error rather than something to overwrite.
 */
export interface McpConfigFormat {
  /** The servers map, keyed by server name. Throws on an unparseable file. */
  servers(path: string, raw: string | null): Record<string, unknown>;
  /** New file contents with `deps` added or replaced. */
  merge(path: string, raw: string | null, deps: McpDependency[]): string;
  /** New file contents without `names`; "" when nothing else is left in the file; null when none were present. */
  prune(path: string, raw: string | null, names: string[]): string | null;
  /** Throws if `text` isn't valid for this format. */
  validate(text: string): void;
}

/** Shape of one server entry, shared by every format. */
export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export function mcpEntry(dep: McpDependency): McpServerEntry {
  return {
    command: dep.command,
    args: dep.args,
    ...(Object.keys(dep.env).length > 0 ? { env: dep.env } : {}),
  };
}

/** Does an on-disk server entry still launch what `dep` describes? Extra keys a tool adds are fine. */
export function mcpEntryMatches(actual: unknown, dep: McpDependency): boolean {
  if (!actual || typeof actual !== "object") return false;
  const a = actual as Partial<McpServerEntry>;
  const want = mcpEntry(dep);
  return (
    a.command === want.command &&
    JSON.stringify(a.args ?? []) === JSON.stringify(want.args) &&
    JSON.stringify(a.env ?? {}) === JSON.stringify(want.env ?? {})
  );
}

/** Null-prototype copy, so a `__proto__` key in a user's config stays inert. */
const inert = (obj: unknown): Record<string, unknown> =>
  Object.assign(Object.create(null) as Record<string, unknown>, obj && typeof obj === "object" ? obj : {});

// ---------------------------------------------------------------- JSON

function parseJsonConfig(path: string, raw: string | null): Record<string, unknown> {
  if (raw === null || raw.trim() === "") return {};
  let root: unknown;
  try {
    root = JSON.parse(raw);
  } catch {
    throw new Error(`${path} is not valid JSON — fix or remove it, then retry (perezdev never rewrites a config it can't parse)`);
  }
  if (!root || typeof root !== "object" || Array.isArray(root)) throw new Error(`${path} is not a JSON object`);
  return root as Record<string, unknown>;
}

const json: McpConfigFormat = {
  servers: (path, raw) => inert(parseJsonConfig(path, raw).mcpServers),
  merge(path, raw, deps) {
    const root = parseJsonConfig(path, raw);
    const servers = inert(root.mcpServers);
    for (const dep of deps) servers[dep.name] = mcpEntry(dep);
    root.mcpServers = servers;
    return JSON.stringify(root, null, 2) + "\n";
  },
  prune(path, raw, names) {
    if (raw === null) return null;
    const root = parseJsonConfig(path, raw);
    const servers = inert(root.mcpServers);
    const present = names.filter((n) => n in servers);
    if (present.length === 0) return null;
    for (const n of present) delete servers[n];
    // A config holding nothing but an empty server map was ours to begin with — remove it.
    if (Object.keys(servers).length === 0 && Object.keys(root).every((k) => k === "mcpServers")) return "";
    root.mcpServers = servers;
    return JSON.stringify(root, null, 2) + "\n";
  },
  validate: (text) => void JSON.parse(text),
};

// ---------------------------------------------------------------- TOML

function parseTomlConfig(path: string, raw: string | null): Record<string, unknown> {
  if (raw === null || raw.trim() === "") return {};
  try {
    return parseToml(raw) as Record<string, unknown>;
  } catch (err) {
    const why = err instanceof Error ? err.message.split("\n")[0] : String(err);
    throw new Error(`${path} is not valid TOML (${why}) — fix it, then retry`);
  }
}

/** `[mcp_servers.name]` or `[mcp_servers.name.sub]` → "name"; any other table header → null. */
function tableServer(line: string): string | null | undefined {
  const m = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/.exec(line);
  if (!m) return undefined; // not a header line
  const parts = m[1]!.split(".").map((p) => p.trim().replace(/^"(.*)"$/, "$1"));
  return parts[0] === "mcp_servers" && parts[1] ? parts[1] : null;
}

/** Drop the tables (and sub-tables) of the named servers, keeping every other line verbatim. */
function withoutTables(raw: string, names: Set<string>): { text: string; removed: number } {
  const out: string[] = [];
  let skipping = false;
  let removed = 0;
  for (const line of raw.split("\n")) {
    const server = tableServer(line);
    if (server !== undefined) {
      const drop = server !== null && names.has(server);
      if (drop && !skipping) removed++;
      skipping = drop;
    }
    if (!skipping) out.push(line);
  }
  return { text: out.join("\n"), removed };
}

const tomlString = (s: string) => JSON.stringify(s); // JSON escapes are valid TOML basic-string escapes
const tomlKey = (k: string) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : tomlString(k));

function tomlTable(dep: McpDependency): string {
  const lines = [
    `[mcp_servers.${tomlKey(dep.name)}]`,
    `command = ${tomlString(dep.command)}`,
    `args = [${dep.args.map(tomlString).join(", ")}]`,
  ];
  const env = Object.entries(dep.env);
  if (env.length > 0) lines.push(`env = { ${env.map(([k, v]) => `${tomlKey(k)} = ${tomlString(v)}`).join(", ")} }`);
  return lines.join("\n");
}

const toml: McpConfigFormat = {
  servers: (path, raw) => inert(parseTomlConfig(path, raw).mcp_servers),
  merge(path, raw, deps) {
    parseTomlConfig(path, raw);
    const base = withoutTables(raw ?? "", new Set(deps.map((d) => d.name))).text.replace(/\s+$/, "");
    const text = [base, ...deps.map(tomlTable)].filter(Boolean).join("\n\n") + "\n";
    const servers = inert(parseTomlConfig(path, text).mcp_servers);
    for (const dep of deps) {
      // A server defined some other way (inline table, dotted keys) can't be edited surgically.
      if (!mcpEntryMatches(servers[dep.name], dep)) {
        throw new Error(`${path} defines '${dep.name}' in a form perezdev can't edit safely — remove it by hand, then retry`);
      }
    }
    return text;
  },
  prune(path, raw, names) {
    if (raw === null) return null;
    parseTomlConfig(path, raw);
    const { text, removed } = withoutTables(raw, new Set(names));
    if (removed === 0) return null;
    const rest = text.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "");
    return rest ? `${rest}\n` : "";
  },
  validate: (text) => void parseToml(text),
};

/** The format for a config path, by extension. */
export function mcpFormat(path: string): McpConfigFormat {
  return path.endsWith(".toml") ? toml : json;
}
