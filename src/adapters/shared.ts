import matter from "gray-matter";
import type { AgentSpec, McpDependency } from "../core/agent-spec.js";
import { atomicWrite, backup, readIfExists } from "../util/fs-safe.js";
import type { PlannedFile } from "./types.js";

/** Frontmatter key inspo stamps on files it owns, for safe detection. */
export const INSPO_MARK = "x-inspo";

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
  const data: Record<string, unknown> = {
    name: spec.name,
    description: trigger.replace(/\s*\.?$/, "."),
    version: spec.version,
    [INSPO_MARK]: true,
  };
  if (spec.allowedTools.length > 0) data["allowed-tools"] = spec.allowedTools;

  const body = [`# ${spec.role}`, "", spec.instructions.trim(), ""].join("\n");
  return matter.stringify(body, data);
}

/** Build a plain markdown instruction doc (for tools without SKILL.md). */
export function buildInstructionMarkdown(spec: AgentSpec): string {
  return [
    `<!-- ${INSPO_MARK}: true | version: ${spec.version} -->`,
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

/** Was this file content produced by inspo? Checks the mark. */
export function isInspoOwned(content: string): boolean {
  if (content.includes(`${INSPO_MARK}: true`)) return true;
  try {
    const parsed = matter(content);
    return parsed.data?.[INSPO_MARK] === true;
  } catch {
    return false;
  }
}

/** Read the `version` from a SKILL.md/instruction file if present. */
export function readVersion(content: string): string | undefined {
  try {
    const parsed = matter(content);
    if (typeof parsed.data?.version === "string") return parsed.data.version;
  } catch {
    /* fall through to comment form */
  }
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
  const servers = (root.mcpServers as Record<string, McpServerEntry>) ?? {};
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
