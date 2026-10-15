import { mkdir, readFile, rename, writeFile, stat, copyFile, unlink, rmdir, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { perezdevDir } from "../core/config.js";

/** Does a path exist? */
export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Read a file as UTF-8, or return null if it does not exist. */
export async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Write a file atomically: write to a temp sibling then rename into place.
 * Creates parent directories as needed and keeps an existing file's mode, so a
 * 0600 config (e.g. ~/.claude.json) never becomes world-readable.
 */
export async function atomicWrite(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const mode = await stat(path).then((s) => s.mode & 0o777, () => undefined);
  const tmp = `${path}.perezdev-tmp-${process.pid}`;
  await writeFile(tmp, contents, { encoding: "utf8", mode });
  await rename(tmp, path);
}

/**
 * Same text, ignoring CRLF vs LF. Git for Windows checks files out with CRLF by
 * default, which must not count as drift.
 */
export function sameText(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return a.replace(/\r\n/g, "\n") === b.replace(/\r\n/g, "\n");
}

/** Remove a file if it exists. No-op otherwise. */
export async function removeIfExists(path: string): Promise<boolean> {
  if (!(await exists(path))) return false;
  await unlink(path);
  return true;
}

/** Remove a directory only if it is empty. Returns true if removed. */
export async function removeDirIfEmpty(path: string): Promise<boolean> {
  try {
    if ((await readdir(path)).length > 0) return false;
    await rmdir(path);
    return true;
  } catch {
    return false;
  }
}

/** Copy a file to a timestamped backup in the app cache. Returns the backup path. */
export async function cacheBackup(path: string, stamp: string): Promise<string | null> {
  if (!(await exists(path))) return null;
  const dir = join(perezdevDir(), "backups");
  await mkdir(dir, { recursive: true });
  const dest = join(dir, `${basename(path)}.${stamp.replace(/[:.]/g, "-")}.bak`);
  await copyFile(path, dest);
  return dest;
}

/** Throws if `text` is not the expected format. */
export type Validator = (text: string) => void;
export const validateJson: Validator = (t) => {
  JSON.parse(t);
};

/** Validate the intended contents, then write atomically. Bad content never lands. */
export async function atomicWriteValidated(path: string, contents: string, validate?: Validator): Promise<void> {
  if (validate) validate(contents);
  await atomicWrite(path, contents);
}

/**
 * Run `fn`, having cache-backed-up `paths` first. If `fn` throws, restore each
 * path from its backup (or delete it if it didn't exist), then rethrow — so a
 * mid-task crash never leaves a half-written config behind.
 */
export async function withRollback<T>(paths: string[], stamp: string, fn: () => Promise<T>): Promise<T> {
  const backups = new Map<string, string | null>();
  for (const p of new Set(paths)) backups.set(p, await cacheBackup(p, stamp));
  try {
    return await fn();
  } catch (err) {
    for (const [p, bak] of backups) {
      if (bak) {
        await mkdir(dirname(p), { recursive: true });
        await copyFile(bak, p);
      } else await removeIfExists(p);
    }
    throw err;
  }
}

/** A single line-level diff entry for preview. */
export interface DiffLine {
  type: "add" | "remove" | "context";
  text: string;
}

/**
 * Produce a minimal line-oriented diff between old and new content for preview.
 * Not a true LCS diff — good enough to show a human what will change.
 */
export function previewDiff(oldText: string | null, newText: string): DiffLine[] {
  const oldLines = oldText === null ? [] : oldText.split("\n");
  const newLines = newText.split("\n");
  const max = Math.max(oldLines.length, newLines.length);
  const out: DiffLine[] = [];
  for (let i = 0; i < max; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n) {
      if (o !== undefined) out.push({ type: "context", text: o });
    } else {
      if (o !== undefined) out.push({ type: "remove", text: o });
      if (n !== undefined) out.push({ type: "add", text: n });
    }
  }
  return out;
}
