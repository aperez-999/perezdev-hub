import { readdir, readFile, stat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { resourcePathSchema, slugSchema, type AgentSpec, type Origin, type ToolId } from "./agent-spec.js";
import { exists } from "../util/fs-safe.js";

/**
 * Where `perezdev add` reads skills from: a GitHub repository (fetched as one
 * tarball, no git needed) or a local folder. Either way the result is a set of
 * text files that is searched for `SKILL.md` folders.
 */
export type SkillSource =
  | { kind: "github"; owner: string; repo: string; path: string; ref?: string }
  | { kind: "local"; dir: string };

const GITHUB_SPEC = /^(?:github:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?((?:\/[^@\s]+)*)?(?:@([\w./-]+))?$/;

/**
 * Accepted forms:
 *   owner/repo · owner/repo/path/to/skill · github:owner/repo@v1.2
 *   https://github.com/owner/repo/tree/<ref>/<path>
 *   ./local/folder · /abs/folder
 */
export async function parseSource(input: string, cwd: string = process.cwd()): Promise<SkillSource> {
  const raw = input.trim();
  const url = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)((?:\/[^/]+)*))?\/?$/.exec(raw);
  if (url) {
    return { kind: "github", owner: url[1]!, repo: url[2]!, ref: url[3], path: trimSlashes(url[4] ?? "") };
  }
  const looksLocal = /^(\.{1,2}[\\/]|[\\/]|~)/.test(raw) || isAbsolute(raw);
  if (looksLocal || (!raw.startsWith("github:") && (await exists(resolve(cwd, raw))))) {
    return { kind: "local", dir: resolve(cwd, raw.replace(/^~(?=$|[\\/])/, process.env.HOME ?? "~")) };
  }
  const m = GITHUB_SPEC.exec(raw);
  if (!m) throw new Error(`can't read '${input}' as a skill source — use owner/repo[/path][@ref], a GitHub URL, or a local folder`);
  return { kind: "github", owner: m[1]!, repo: m[2]!, path: trimSlashes(m[3] ?? ""), ref: m[4] };
}

const trimSlashes = (s: string) => s.replace(/^\/+|\/+$/g, "");

export function describeSource(src: SkillSource): string {
  if (src.kind === "local") return src.dir;
  return `${src.owner}/${src.repo}${src.path ? `/${src.path}` : ""}${src.ref ? `@${src.ref}` : ""}`;
}

/** Text files found at a source, keyed by path relative to the requested folder. */
export interface SourceTree {
  files: Map<string, string>;
  /** Paths skipped as binary or oversized. */
  skipped: string[];
  /** Resolved commit (GitHub). */
  commit?: string;
}

const MAX_TARBALL = 30 * 1024 * 1024;
const MAX_FILE = 256 * 1024;
const FETCH_MS = 30_000;

const isText = (buf: Uint8Array) => !buf.subarray(0, 8000).includes(0);

/** Pull `path=value` records out of a pax header block. */
function paxRecords(body: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    const space = body.indexOf(0x20, i);
    if (space < 0) break;
    const len = Number(body.subarray(i, space).toString("ascii"));
    if (!len) break;
    const record = body.subarray(space + 1, i + len - 1).toString("utf8");
    const eq = record.indexOf("=");
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1);
    i += len;
  }
  return out;
}

/** Minimal ustar/pax reader — enough for GitHub's `git archive` tarballs. Regular files only. */
export function untar(buf: Buffer): { files: Map<string, Buffer>; comment?: string } {
  const files = new Map<string, Buffer>();
  let comment: string | undefined;
  let pax: Record<string, string> = {};
  let longName: string | undefined;
  for (let off = 0; off + 512 <= buf.length; ) {
    const header = buf.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start: number, len: number) => header.subarray(start, start + len).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const type = field(156, 1) || "0";
    const body = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;

    if (type === "g") {
      comment = paxRecords(body).comment ?? comment;
      continue;
    }
    if (type === "x") {
      pax = paxRecords(body);
      continue;
    }
    if (type === "L") {
      longName = body.toString("utf8").replace(/\0.*$/s, "");
      continue;
    }
    const prefix = field(345, 155);
    const name = pax.path ?? longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    pax = {};
    longName = undefined;
    if (type === "0") files.set(name, Buffer.from(body));
  }
  return { files, comment };
}

/** Keep text files under `root` (a `/`-separated prefix), keyed relative to it. */
function subtree(entries: Iterable<[string, Uint8Array]>, root: string): SourceTree {
  const files = new Map<string, string>();
  const skipped: string[] = [];
  const prefix = root ? `${root}/` : "";
  for (const [path, data] of entries) {
    if (!path.startsWith(prefix)) continue;
    const rel = path.slice(prefix.length);
    if (!rel || rel.split("/").some((seg) => seg === ".." || seg.startsWith("."))) continue;
    if (data.length > MAX_FILE || !isText(data)) {
      skipped.push(rel);
      continue;
    }
    files.set(rel, Buffer.from(data).toString("utf8"));
  }
  return { files, skipped };
}

async function fetchGithub(src: Extract<SkillSource, { kind: "github" }>): Promise<SourceTree> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const url = `https://api.github.com/repos/${src.owner}/${src.repo}/tarball${src.ref ? `/${encodeURIComponent(src.ref)}` : ""}`;
  const res = await fetch(url, {
    headers: { accept: "application/vnd.github+json", "user-agent": "perezdev", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (res.status === 404) throw new Error(`${src.owner}/${src.repo}${src.ref ? `@${src.ref}` : ""} not found (private repos need GITHUB_TOKEN)`);
  if (res.status === 403 || res.status === 429) throw new Error(`GitHub rate limit hit — set GITHUB_TOKEN and retry`);
  if (!res.ok) throw new Error(`GitHub returned ${res.status} for ${src.owner}/${src.repo}`);
  const gz = Buffer.from(await res.arrayBuffer());
  if (gz.length > MAX_TARBALL) throw new Error(`${src.owner}/${src.repo} is larger than ${MAX_TARBALL / 1024 / 1024} MB — point at a subfolder or clone it and add locally`);

  const { files, comment } = untar(gunzipSync(gz, { maxOutputLength: MAX_TARBALL * 8 }));
  // GitHub tarballs wrap everything in one `<owner>-<repo>-<sha>/` folder.
  const unwrapped = [...files].map(([p, d]) => [p.slice(p.indexOf("/") + 1), d] as [string, Uint8Array]);
  const tree = subtree(unwrapped, src.path);
  if (tree.files.size === 0) throw new Error(`nothing found at '${src.path || "/"}' in ${src.owner}/${src.repo}`);
  return { ...tree, commit: comment && /^[0-9a-f]{40}$/.test(comment) ? comment : undefined };
}

async function walk(dir: string, base = dir, out: [string, Uint8Array][] = []): Promise<[string, Uint8Array][]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, base, out);
    else if (e.isFile() && (await stat(full)).size <= MAX_FILE * 4) out.push([relative(base, full).split("\\").join("/"), await readFile(full)]);
  }
  return out;
}

export async function fetchSource(src: SkillSource): Promise<SourceTree> {
  if (src.kind === "github") return fetchGithub(src);
  if (!(await exists(src.dir))) throw new Error(`no such folder: ${src.dir}`);
  return subtree(await walk(src.dir), "");
}

/** A `SKILL.md` folder found in a source. */
export interface FoundSkill {
  /** Folder relative to the source root ("" when the source is the skill itself). */
  dir: string;
  name: string;
  description: string;
  frontmatter: string;
  body: string;
  allowedTools: string[];
  resources: Record<string, string>;
}

export interface SkillProblem {
  dir: string;
  reason: string;
}

const MAX_RESOURCES = 2 * 1024 * 1024;

/** `allowed-tools` may be a YAML list or a space-separated string; parentheses group (`Bash(git diff:*)`). */
function toolList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  return value.match(/[^\s(]+(?:\([^)]*\))?/g) ?? [];
}

/** Find every skill folder in a tree. Nested skill folders are separate skills, not resources. */
export function findSkills(tree: SourceTree): { skills: FoundSkill[]; problems: SkillProblem[] } {
  const dirs = [...tree.files.keys()]
    .filter((p) => p === "SKILL.md" || p.endsWith("/SKILL.md"))
    .map((p) => p.slice(0, -"SKILL.md".length).replace(/\/$/, ""))
    .sort();
  const skills: FoundSkill[] = [];
  const problems: SkillProblem[] = [];

  for (const dir of dirs) {
    const raw = tree.files.get(dir ? `${dir}/SKILL.md` : "SKILL.md")!.replace(/\r\n/g, "\n");
    const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
    if (!m) {
      problems.push({ dir, reason: "SKILL.md has no frontmatter" });
      continue;
    }
    let meta: Record<string, unknown>;
    try {
      meta = (parseYaml(m[1]!) ?? {}) as Record<string, unknown>;
    } catch {
      problems.push({ dir, reason: "SKILL.md frontmatter isn't valid YAML" });
      continue;
    }
    const name = String(meta.name ?? dir.split("/").pop() ?? "");
    if (!slugSchema.safeParse(name).success) {
      problems.push({ dir, reason: `name '${name}' isn't a valid skill name` });
      continue;
    }
    const description = typeof meta.description === "string" ? meta.description.trim() : "";
    // 1536 is Claude Code's limit; the Agent Skills spec (and Copilot) cap at 1024.
    if (description.length < 8 || description.length > 1536) {
      problems.push({ dir, reason: "description is missing, too short, or over 1536 characters" });
      continue;
    }
    if (!m[2]!.trim()) {
      problems.push({ dir, reason: "SKILL.md has no instructions" });
      continue;
    }

    const prefix = dir ? `${dir}/` : "";
    const nested = dirs.filter((d) => d !== dir && d.startsWith(prefix));
    const resources: Record<string, string> = {};
    let size = 0;
    for (const [path, text] of tree.files) {
      if (!path.startsWith(prefix) || path === `${prefix}SKILL.md`) continue;
      if (nested.some((d) => path.startsWith(`${d}/`))) continue;
      const rel = path.slice(prefix.length);
      if (!resourcePathSchema.safeParse(rel).success) continue;
      resources[rel] = text;
      size += text.length;
    }
    if (size > MAX_RESOURCES) {
      problems.push({ dir, reason: `bundled files total ${(size / 1024 / 1024).toFixed(1)} MB (limit 2 MB)` });
      continue;
    }
    skills.push({ dir, name, description, frontmatter: m[1]!, body: m[2]!, allowedTools: toolList(meta["allowed-tools"]), resources });
  }
  return { skills, problems };
}

/** The lockfile origin for a skill, so `upgrade` can find it again. */
export function originOf(src: SkillSource, skill: FoundSkill, tree: SourceTree, scopeRoot: string): Origin {
  if (src.kind === "local") {
    const rel = relative(scopeRoot, join(src.dir, skill.dir)).split("\\").join("/");
    return { source: `file:${rel || "."}`, path: "" };
  }
  const path = [src.path, skill.dir].filter(Boolean).join("/");
  return { source: `github:${src.owner}/${src.repo}`, path, ...(src.ref ? { ref: src.ref } : {}), ...(tree.commit ? { commit: tree.commit } : {}) };
}

/** Turn a found skill into an agent spec that reproduces it verbatim. */
export function skillToSpec(skill: FoundSkill, origin: Origin, targets: ToolId[]): AgentSpec {
  return {
    name: skill.name,
    description: skill.description,
    role: `the ${skill.name} skill`,
    instructions: skill.body,
    allowedTools: skill.allowedTools,
    mcpDependencies: [],
    targets,
    version: origin.commit ? origin.commit.slice(0, 7) : "0.1.0",
    source: "imported",
    origin,
    frontmatter: skill.frontmatter,
    resources: skill.resources,
  };
}

/** Where to fetch an origin from again (for `upgrade`). */
export function sourceOfOrigin(origin: Origin, scopeRoot: string): SkillSource {
  if (origin.source.startsWith("file:")) return { kind: "local", dir: resolve(scopeRoot, origin.source.slice(5)) };
  const [owner, repo] = origin.source.slice("github:".length).split("/") as [string, string];
  return { kind: "github", owner, repo, path: origin.path, ...(origin.ref ? { ref: origin.ref } : {}) };
}
