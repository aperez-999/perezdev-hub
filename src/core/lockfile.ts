import { z } from "zod";
import { agentSpecSchema, mcpDependencySchema, TOOL_IDS, type AgentSpec, type McpDependency, type ToolId } from "./agent-spec.js";
import { lockfilePath, type Scope } from "./scope.js";
import { atomicWrite, readIfExists } from "../util/fs-safe.js";

/**
 * The lockfile records every agent and MCP server perezdev manages in a scope,
 * with the full spec, so any tool's files can be regenerated from it. In a
 * project it lives at the repo root and is meant to be committed.
 */

const lockEntrySchema = z.object({
  spec: agentSpecSchema,
  /** When this spec last changed (ISO). Re-applying an unchanged spec keeps it. */
  installedAt: z.string(),
});
export type LockEntry = z.infer<typeof lockEntrySchema>;

/** A standalone MCP server (no owning agent). */
const mcpEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  dependency: mcpDependencySchema,
  targets: z.array(z.enum(TOOL_IDS)),
  installedAt: z.string(),
});
export type McpEntry = z.infer<typeof mcpEntrySchema>;

const lockfileSchema = z.object({
  lockfileVersion: z.literal(1).default(1),
  agents: z.record(lockEntrySchema).default({}),
  mcpServers: z.record(mcpEntrySchema).default({}),
  /** Keep a generated Commands section in AGENTS.md (and link CLAUDE.md to it). Project scope. */
  agentsMd: z.boolean().optional(),
});
export type Lockfile = z.infer<typeof lockfileSchema>;

const EMPTY: Lockfile = { lockfileVersion: 1, agents: {}, mcpServers: {} };

/**
 * Read and validate the lockfile. Absent → empty. Present but unreadable is an
 * error: treating it as empty would let the next write erase every entry.
 */
export async function readLock(scope: Scope): Promise<Lockfile> {
  const path = lockfilePath(scope);
  const raw = await readIfExists(path);
  if (!raw) return structuredClone(EMPTY);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`${path} is not valid JSON — resolve it (merge conflict?) before running perezdev`);
  }
  const parsed = lockfileSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`${path} is invalid: ${issue ? `${issue.path.join(".")} — ${issue.message}` : "schema mismatch"}`);
  }
  return parsed.data;
}

const sortKeys = <T>(rec: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(rec).sort(([a], [b]) => a.localeCompare(b)));

/** Write the lockfile atomically, keys sorted so committed diffs stay minimal. */
export async function writeLock(scope: Scope, lock: Lockfile): Promise<void> {
  const out: Lockfile = {
    lockfileVersion: 1,
    agents: sortKeys(lock.agents),
    mcpServers: sortKeys(lock.mcpServers),
    ...(lock.agentsMd ? { agentsMd: true } : {}),
  };
  await atomicWrite(lockfilePath(scope), JSON.stringify(out, null, 2) + "\n");
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Insert or update many agents with a single lockfile read/write. */
export async function upsertAgents(scope: Scope, specs: AgentSpec[], now: string): Promise<void> {
  if (specs.length === 0) return;
  const lock = await readLock(scope);
  for (const spec of specs) {
    const prev = lock.agents[spec.name];
    lock.agents[spec.name] = { spec, installedAt: prev && sameJson(prev.spec, spec) ? prev.installedAt : now };
  }
  await writeLock(scope, lock);
}

/** Remove an agent entry by name. Returns true if it existed. */
export async function removeAgentEntry(scope: Scope, name: string): Promise<boolean> {
  const lock = await readLock(scope);
  if (!(name in lock.agents)) return false;
  delete lock.agents[name];
  await writeLock(scope, lock);
  return true;
}

/** Get a single agent's spec from the lockfile, or null. */
export async function getAgentSpec(scope: Scope, name: string): Promise<AgentSpec | null> {
  return (await readLock(scope)).agents[name]?.spec ?? null;
}

/** All recorded agent entries, sorted by name. */
export async function listEntries(scope: Scope): Promise<LockEntry[]> {
  return Object.values((await readLock(scope)).agents);
}

/** Insert or update a standalone MCP server entry. */
export async function upsertMcpEntry(
  scope: Scope,
  id: string,
  name: string,
  dependency: McpDependency,
  targets: ToolId[],
  now: string,
): Promise<void> {
  const lock = await readLock(scope);
  const prev = lock.mcpServers[id];
  const unchanged = prev && sameJson(prev.dependency, dependency) && sameJson(prev.targets, targets);
  lock.mcpServers[id] = { id, name, dependency, targets, installedAt: unchanged ? prev.installedAt : now };
  await writeLock(scope, lock);
}

/** Remove a standalone MCP server entry by id. Returns true if it existed. */
export async function removeMcpEntry(scope: Scope, id: string): Promise<boolean> {
  const lock = await readLock(scope);
  if (!(id in lock.mcpServers)) return false;
  delete lock.mcpServers[id];
  await writeLock(scope, lock);
  return true;
}

/** Get a single MCP server entry by id, or null. */
export async function getMcpEntry(scope: Scope, id: string): Promise<McpEntry | null> {
  return (await readLock(scope)).mcpServers[id] ?? null;
}

/** All recorded MCP server entries. */
export async function listMcpEntries(scope: Scope): Promise<McpEntry[]> {
  return Object.values((await readLock(scope)).mcpServers);
}
