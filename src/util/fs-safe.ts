import { mkdir, readFile, rename, writeFile, stat, copyFile, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { inspoDir } from "../core/config.js";

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
 * Creates parent directories as needed. Prevents half-written config files.
 */
export async function atomicWrite(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.inspo-tmp-${process.pid}`;
  await writeFile(tmp, contents, "utf8");
  await rename(tmp, path);
}

/**
 * Back up a file to `<path>.inspo.bak` if it exists and no backup exists yet.
 * Returns the backup path if one was created, else null.
 */
export async function backup(path: string): Promise<string | null> {
  if (!(await exists(path))) return null;
  const bak = `${path}.inspo.bak`;
  if (await exists(bak)) return bak;
  await copyFile(path, bak);
  return bak;
}

/**
 * Restore a `<path>.inspo.bak` backup over the original, removing the backup.
 * Returns true if a backup was restored.
 */
export async function restoreBackup(path: string): Promise<boolean> {
  const bak = `${path}.inspo.bak`;
  if (!(await exists(bak))) return false;
  await copyFile(bak, path);
  await unlink(bak);
  return true;
}

/** Remove a file if it exists. No-op otherwise. */
export async function removeIfExists(path: string): Promise<boolean> {
  if (!(await exists(path))) return false;
  await unlink(path);
  return true;
}

/** Copy a file to a timestamped backup in the app cache. Returns the backup path. */
export async function cacheBackup(path: string, stamp: string): Promise<string | null> {
  if (!(await exists(path))) return null;
  const dir = join(inspoDir(), "backups");
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
  for (const p of paths) backups.set(p, await cacheBackup(p, stamp));
  try {
    return await fn();
  } catch (err) {
    for (const [p, bak] of backups) {
      if (bak) await copyFile(bak, p);
      else await removeIfExists(p);
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

/** A surgical search/replace edit: `find` must occur exactly once in the file. */
export interface Edit {
  find: string;
  replace: string;
}

/**
 * Apply search/replace edits to `text`, returning the new content. Pure — the
 * caller writes it (e.g. under withRollback). Throws if any `find` is missing or
 * occurs more than once, so an ambiguous patch never silently mis-applies.
 */
export function applyEdits(text: string, edits: Edit[]): string {
  let out = text;
  for (const [i, edit] of edits.entries()) {
    if (!edit.find) throw new Error(`edit ${i + 1}: empty 'find'`);
    const count = out.split(edit.find).length - 1;
    if (count === 0) throw new Error(`edit ${i + 1}: 'find' snippet not present in the file`);
    if (count > 1) throw new Error(`edit ${i + 1}: 'find' snippet is ambiguous (${count} matches) — needs more context`);
    out = out.replace(edit.find, edit.replace);
  }
  return out;
}
