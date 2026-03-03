import { mkdir, readFile, rename, writeFile, stat, copyFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";

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
