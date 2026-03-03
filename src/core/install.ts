import { getAdapter } from "../adapters/registry.js";
import type { PlannedFile } from "../adapters/types.js";
import { atomicWrite, backup } from "../util/fs-safe.js";
import { upsertAgent } from "./lockfile.js";
import type { AgentSpec } from "./agent-spec.js";

/** Compute every file installing `spec` would write, across all its targets. */
export async function planSpec(spec: AgentSpec): Promise<PlannedFile[]> {
  const planned: PlannedFile[] = [];
  for (const t of spec.targets) planned.push(...(await getAdapter(t).plan(spec)));
  return planned;
}

/** Back up and atomically write the planned files. Returns what was written. */
export async function writeFiles(planned: PlannedFile[]): Promise<PlannedFile[]> {
  for (const f of planned) {
    await backup(f.path);
    await atomicWrite(f.path, f.contents);
  }
  return planned;
}

/**
 * Install a spec end-to-end: write its files to every target tool, then record
 * it in the lockfile. The single path every command (create, import, preset,
 * update) routes through.
 */
export async function installSpec(spec: AgentSpec, now: string): Promise<PlannedFile[]> {
  const written = await writeFiles(await planSpec(spec));
  await upsertAgent(spec, now);
  return written;
}

/** Bump the patch component of a semver-ish version string (x.y.z). */
export function bumpPatch(version: string): string {
  const parts = version.split(".");
  const patch = Number(parts[2] ?? "0");
  if (parts.length < 3 || Number.isNaN(patch)) return `${version}.1`;
  return `${parts[0]}.${parts[1]}.${patch + 1}`;
}
