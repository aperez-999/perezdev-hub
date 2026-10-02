import { execFile } from "node:child_process";
import { access, readdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join, relative } from "node:path";
import { promisify } from "node:util";
import { AGENTS_MD, CLAUDE_MD } from "../adapters/context.js";
import { agentFiles, mcpFiles } from "../adapters/plan.js";
import { getMcpServer } from "../registry/index.js";
import type { McpDependency } from "./agent-spec.js";
import type { Lockfile } from "./lockfile.js";
import { lockfilePath, type Scope } from "./scope.js";

const run = promisify(execFile);

/**
 * What still stands between an installed setup and a working one: MCP
 * launchers that aren't on PATH, secrets that aren't set, generated files git
 * won't share, and whether CI checks for drift. Read-only; never fails a command.
 */
export interface Readiness {
  /** Launcher binaries missing from PATH, with the servers that need them. */
  missingLaunchers: { bin: string; servers: string[] }[];
  /** Environment variables catalog servers read that aren't set in this shell. */
  missingEnv: { name: string; servers: string[] }[];
  /** Generated files (repo-relative) that .gitignore hides from teammates. */
  ignored: string[];
  /** Generated files (repo-relative) that are new or changed and not committed. */
  uncommitted: string[];
  /** A workflow under .github/workflows runs `perezdev doctor`. */
  ci: boolean;
}

/** Is `bin` an executable on PATH? Looks only; runs nothing. */
export async function onPath(bin: string): Promise<boolean> {
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      try {
        await access(join(dir, bin + ext), constants.X_OK);
        return true;
      } catch {
        // keep looking
      }
    }
  }
  return false;
}

/** Every MCP server a lockfile launches, by name. */
function launchedServers(lock: Lockfile): Map<string, McpDependency> {
  const servers = new Map<string, McpDependency>();
  for (const { spec } of Object.values(lock.agents)) for (const dep of spec.mcpDependencies) servers.set(dep.name, dep);
  for (const entry of Object.values(lock.mcpServers)) servers.set(entry.id, entry.dependency);
  return servers;
}

const group = (pairs: [string, string][]) => {
  const out = new Map<string, string[]>();
  for (const [key, value] of pairs) out.set(key, [...(out.get(key) ?? []), value]);
  return [...out];
};

/** Repo-relative paths of everything perezdev manages in a project. */
export function managedPaths(scope: Scope, lock: Lockfile): string[] {
  const paths = new Set<string>([lockfilePath(scope)]);
  for (const { spec } of Object.values(lock.agents)) {
    for (const f of agentFiles(spec, scope)) paths.add(f.path);
    if (spec.mcpDependencies.length > 0) for (const f of mcpFiles(spec.targets, scope)) paths.add(f.path);
  }
  for (const entry of Object.values(lock.mcpServers)) for (const f of mcpFiles(entry.targets, scope)) paths.add(f.path);
  if (lock.agentsMd) {
    paths.add(join(scope.root, AGENTS_MD));
    paths.add(join(scope.root, CLAUDE_MD));
  }
  // The CI check perezdev writes is part of the setup to commit.
  paths.add(join(scope.root, ".github", "workflows", "perezdev.yml"));
  return [...paths].map((p) => relative(scope.root, p).split("\\").join("/")).sort();
}

/** Git's view of the managed paths. Null outside a git checkout or when git isn't installed. */
async function gitState(root: string, paths: string[]): Promise<{ ignored: string[]; uncommitted: string[] } | null> {
  if (paths.length === 0) return { ignored: [], uncommitted: [] };
  try {
    const { stdout } = await run("git", ["status", "--porcelain", "--untracked-files=all", "--ignored=matching", "--", ...paths], {
      cwd: root,
      maxBuffer: 4 * 1024 * 1024,
    });
    const ignored: string[] = [];
    const uncommitted: string[] = [];
    for (const line of stdout.split("\n").filter(Boolean)) {
      const code = line.slice(0, 2);
      const path = line.slice(3).replace(/^"|"$/g, "");
      if (code === "!!") ignored.push(path);
      else uncommitted.push(path);
    }
    return { ignored, uncommitted };
  } catch {
    return null;
  }
}

/** Does a GitHub Actions workflow already run `perezdev doctor`? */
export async function hasDoctorWorkflow(root: string): Promise<boolean> {
  const dir = join(root, ".github", "workflows");
  const files = await readdir(dir).catch(() => [] as string[]);
  for (const f of files.filter((f) => /\.ya?ml$/.test(f))) {
    const text = await readFile(join(dir, f), "utf8").catch(() => "");
    if (/perezdev(-hub)?\b[^\n]*\bdoctor\b/.test(text) || /dist\/index\.js doctor/.test(text)) return true;
  }
  return false;
}

export async function readiness(scope: Scope, lock: Lockfile): Promise<Readiness> {
  const servers = launchedServers(lock);
  const bins = group([...servers].map(([name, dep]) => [dep.command, name]));
  const missingLaunchers = [];
  for (const [bin, names] of bins) if (!(await onPath(bin))) missingLaunchers.push({ bin, servers: names });

  const envPairs: [string, string][] = [];
  for (const name of servers.keys()) {
    for (const env of getMcpServer(name)?.needs ?? []) if (!process.env[env]) envPairs.push([env, name]);
  }
  const missingEnv = group(envPairs).map(([name, names]) => ({ name, servers: names }));

  if (scope.kind !== "project") return { missingLaunchers, missingEnv, ignored: [], uncommitted: [], ci: false };
  const git = await gitState(scope.root, managedPaths(scope, lock));
  return {
    missingLaunchers,
    missingEnv,
    ignored: git?.ignored ?? [],
    uncommitted: git?.uncommitted ?? [],
    ci: await hasDoctorWorkflow(scope.root),
  };
}

/** Where to get a launcher from. */
export const LAUNCHER_HELP: Record<string, string> = {
  uvx: "install uv: https://docs.astral.sh/uv/getting-started/installation/",
  docker: "install Docker: https://docs.docker.com/get-docker/",
  npx: "install Node.js: https://nodejs.org",
  node: "install Node.js: https://nodejs.org",
};
