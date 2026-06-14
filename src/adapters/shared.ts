import type { AgentSpec, McpDependency } from "../core/agent-spec.js";
import { atomicWrite, backup, readIfExists } from "../util/fs-safe.js";
import type { PlannedFile } from "./types.js";

/** Frontmatter key stamped on files this tool owns, for safe detection. */
export const OWNER_MARK = "x-perezdev";
/** Legacy marker from the project's former name; still recognized on read. */
const LEGACY_MARK = "x-inspo";

/**
 * Emit a string as a YAML scalar — plain when it's a simple word, otherwise a
 * JSON-encoded double-quoted scalar (valid YAML with correct escaping). Keeps a
 * tiny, dependency-free frontmatter writer instead of pulling in a YAML engine.
 */
function yamlScalar(s: string): string {
  if (/^[A-Za-z0-9][\w .,/()@+-]*$/.test(s) && !/^(true|false|null|yes|no|on|off)$/i.test(s)) return s;
  return JSON.stringify(s);
}

/** Serialize a small, known set of fields into a YAML frontmatter block (--- fenced). */
function buildFrontmatter(fields: Array<[string, string | boolean | string[]]>): string {
  const lines = ["---"];
  for (const [k, v] of fields) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${yamlScalar(item)}`);
    } else if (typeof v === "boolean") {
      lines.push(`${k}: ${v}`);
    } else {
      lines.push(`${k}: ${yamlScalar(v)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

/** Read top-level `key: scalar` pairs from a leading frontmatter block (arrays/nesting skipped). */
function parseFrontmatter(content: string): Record<string, string | boolean> {
  const m = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!m) return {};
  const data: Record<string, string | boolean> = {};
  for (const line of m[1]!.split("\n")) {
    const mm = /^([\w-]+):[ \t]*(.*)$/.exec(line);
    if (!mm) continue;
    const key = mm[1]!;
    const v = mm[2]!.trim();
    if (v === "") continue; // array/nested header — callers only need scalars
    if (v === "true") data[key] = true;
    else if (v === "false") data[key] = false;
    else if (v.startsWith('"')) {
      try {
        data[key] = JSON.parse(v) as string;
      } catch {
        data[key] = v;
      }
    } else data[key] = v;
  }
  return data;
}

/**
 * Build a SKILL.md-style markdown document (YAML frontmatter + body) from a
 * spec. Used by tools that consume the Agent Skills format.
 */
export function buildSkillMarkdown(spec: AgentSpec): string {
  // A strong "Use to …" trigger drives Claude Code's skill auto-discovery.
  const desc = spec.description.trim();
  const trigger = /^use\b/i.test(desc)
    ? desc
    : `Use to ${desc.charAt(0).toLowerCase()}${desc.slice(1)}`;
  const fields: Array<[string, string | boolean | string[]]> = [
    ["name", spec.name],
    ["description", trigger.replace(/\s*\.?$/, ".")],
    ["version", spec.version],
    [OWNER_MARK, true],
  ];
  if (spec.allowedTools.length > 0) fields.push(["allowed-tools", spec.allowedTools]);

  const body = [`# ${spec.role}`, "", spec.instructions.trim(), ""].join("\n");
  return `${buildFrontmatter(fields)}\n${body}`;
}

/** Build a plain markdown instruction doc (for tools without SKILL.md). */
export function buildInstructionMarkdown(spec: AgentSpec): string {
  return [
    `<!-- ${OWNER_MARK}: true | version: ${spec.version} -->`,
    `# ${spec.name}`,
    "",
    `**Role:** ${spec.role}`,
    "",
    `**When to use:** ${spec.description}`,
    "",
    "## Instructions",
    "",
    spec.instructions.trim(),
    "",
  ].join("\n");
}

/** Was this file content produced by this tool? Checks the current or legacy mark. */
export function isOwned(content: string): boolean {
  if (content.includes(`${OWNER_MARK}: true`) || content.includes(`${LEGACY_MARK}: true`)) return true;
  const data = parseFrontmatter(content);
  return data[OWNER_MARK] === true || data[LEGACY_MARK] === true;
}

/** Read the `version` from a SKILL.md/instruction file if present. */
export function readVersion(content: string): string | undefined {
  const data = parseFrontmatter(content);
  if (typeof data.version === "string") return data.version;
  const m = content.match(/version:\s*([0-9][^\s|]*)/);
  return m?.[1];
}

/** Plan a single-file write (computes previous contents for diff preview). */
export async function planFile(path: string, contents: string): Promise<PlannedFile> {
  return { path, contents, previous: await readIfExists(path) };
}

/** Commit a planned file: back up any existing file, then write atomically. */
export async function commitFile(file: PlannedFile): Promise<void> {
  await backup(file.path);
  await atomicWrite(file.path, file.contents);
}

/** Shape of an MCP server entry shared by Claude Code and Cursor configs. */
interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Merge MCP dependencies into a JSON config file's `mcpServers` map, returning
 * the new file contents. Existing unrelated servers are preserved.
 */
export async function mergeMcpJson(path: string, deps: McpDependency[]): Promise<string> {
  const raw = await readIfExists(path);
  let root: Record<string, unknown> = {};
  if (raw) {
    try {
      root = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      root = {};
    }
  }
  // Object.create(null): a pre-existing __proto__/constructor key in the user's
  // config can't reach Object.prototype when we copy entries across.
  const servers: Record<string, McpServerEntry> = Object.assign(
    Object.create(null) as Record<string, McpServerEntry>,
    (root.mcpServers as Record<string, McpServerEntry>) ?? {},
  );
  for (const dep of deps) {
    servers[dep.name] = {
      command: dep.command,
      args: dep.args,
      ...(Object.keys(dep.env).length > 0 ? { env: dep.env } : {}),
    };
  }
  root.mcpServers = servers;
  return JSON.stringify(root, null, 2) + "\n";
}

/** Remove MCP dependency entries from a JSON config; returns contents or null if unchanged. */
export async function pruneMcpJson(path: string, deps: McpDependency[]): Promise<string | null> {
  const raw = await readIfExists(path);
  if (!raw) return null;
  let root: Record<string, unknown>;
  try {
    root = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const servers = root.mcpServers as Record<string, unknown> | undefined;
  if (!servers) return null;
  let changed = false;
  for (const dep of deps) {
    if (dep.name in servers) {
      delete servers[dep.name];
      changed = true;
    }
  }
  if (!changed) return null;
  root.mcpServers = servers;
  return JSON.stringify(root, null, 2) + "\n";
}
