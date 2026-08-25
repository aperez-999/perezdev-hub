import { getAdapter } from "../adapters/registry.js";
import type { PlannedFile } from "../adapters/types.js";
import { atomicWrite, backup, readIfExists } from "../util/fs-safe.js";
import { upsertAgents } from "./lockfile.js";
import type { AgentSpec } from "./agent-spec.js";
import { assertSafeMcpLaunch } from "./mcp-allow.js";

/** Confirm each written file actually exists with the expected content — no false passes. */
async function verifyWritten(planned: PlannedFile[]): Promise<void> {
  const failures: string[] = [];
  for (const f of planned) {
    const onDisk = await readIfExists(f.path);
    if (onDisk === null) failures.push(`${f.path} (not written)`);
    else if (onDisk.trim().length === 0) failures.push(`${f.path} (empty)`);
    else if (onDisk !== f.contents) failures.push(`${f.path} (content mismatch)`);
  }
  if (failures.length > 0) {
    throw new Error(`install verification failed:\n  ${failures.join("\n  ")}`);
  }
}

/** Compute every file installing `spec` would write, across all its targets. */
export async function planSpec(spec: AgentSpec): Promise<PlannedFile[]> {
  for (const dep of spec.mcpDependencies) assertSafeMcpLaunch(dep.command, dep.args);
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
 * Install specs end-to-end: plan all, write all, verify, then one lockfile upsert.
 * The single path every command (create, import, preset, Superpowers pack) routes through.
 */
export async function installSpecs(specs: AgentSpec[], now: string): Promise<PlannedFile[]> {
  if (specs.length === 0) return [];
  const planned: PlannedFile[] = [];
  for (const spec of specs) {
    const files = await planSpec(spec);
    if (files.length === 0) {
      throw new Error(`no target tools to install '${spec.name}' into`);
    }
    planned.push(...files);
  }
  const written = await writeFiles(planned);
  await verifyWritten(written);
  await upsertAgents(specs, now);
  return written;
}

/** Install one spec — same pipeline as {@link installSpecs}. */
export async function installSpec(spec: AgentSpec, now: string): Promise<PlannedFile[]> {
  return installSpecs([spec], now);
}

/** Bump the patch component of a semver-ish version string (x.y.z). */
export function bumpPatch(version: string): string {
  const parts = version.split(".");
  const patch = Number(parts[2] ?? "0");
  if (parts.length < 3 || Number.isNaN(patch)) return `${version}.1`;
  return `${parts[0]}.${parts[1]}.${patch + 1}`;
}
