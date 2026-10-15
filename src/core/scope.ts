import { dirname, join, relative, sep } from "node:path";
import { home, perezdevDir } from "./config.js";
import { exists } from "../util/fs-safe.js";

/**
 * Where perezdev reads and writes. `project` targets the repo you're in (files
 * you commit, lockfile at the repo root); `user` targets your home directory
 * (applies to every project, lockfile under ~/.config/perezdev).
 */
export interface Scope {
  kind: "user" | "project";
  /** Directory every tool path is resolved against: $HOME or the repo root. */
  root: string;
}

export interface ScopeOptions {
  /** Force user scope even inside a repository (`-g, --global`). */
  global?: boolean;
}

export const PROJECT_LOCKFILE = "perezdev.lock.json";

export function userScope(): Scope {
  return { kind: "user", root: home() };
}

export function projectScope(root: string): Scope {
  return { kind: "project", root };
}

/** Walk up from `cwd` to the nearest directory containing `.git` (dir or worktree file). */
export async function findRepoRoot(cwd: string): Promise<string | null> {
  let dir = cwd;
  for (;;) {
    if (await exists(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * npm-style resolution: inside a git repository the project is the default,
 * `--global` (or no repository) means the user's home. The home directory
 * itself is never treated as a project, even if it is under version control.
 */
export async function resolveScope(opts: ScopeOptions = {}, cwd: string = process.cwd()): Promise<Scope> {
  if (opts.global) return userScope();
  const root = await findRepoRoot(cwd);
  return root && root !== home() ? projectScope(root) : userScope();
}

export function lockfilePath(scope: Scope): string {
  return scope.kind === "project" ? join(scope.root, PROJECT_LOCKFILE) : join(perezdevDir(), "perezdev-lock.json");
}

/** Short human label, e.g. `project (.)` or `global (~)`. */
export function scopeLabel(scope: Scope, cwd: string = process.cwd()): string {
  if (scope.kind === "user") return "global (~)";
  return `project (${relative(cwd, scope.root) || "."})`;
}

/** Display a path relative to the scope root (`~/…` for user scope), with `/` on every platform. */
export function displayPath(scope: Scope, path: string): string {
  const rel = relative(scope.root, path).split(sep).join("/");
  return scope.kind === "user" ? `~/${rel}` : rel;
}
