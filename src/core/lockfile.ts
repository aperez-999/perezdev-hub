import { z } from "zod";
import { agentSpecSchema, mcpDependencySchema, TOOL_IDS, type AgentSpec, type McpDependency, type ToolId } from "./agent-spec.js";
import { lockfilePath } from "./config.js";
import { atomicWrite, readIfExists } from "../util/fs-safe.js";

/**
 * The lockfile records every agent perezdev has generated/installed and where.
 * It is the source of truth for `list`, `update`, and `remove` (the
 * "npm-for-agents" angle). Lives at ~/.config/perezdev/perezdev-lock.json.
 */

const lockEntrySchema = z.object({
  spec: agentSpecSchema,
  /** ISO timestamp recorded by the caller (kept out of core for determinism). */
  installedAt: z.string(),
});
export type LockEntry = z.infer<typeof lockEntrySchema>;

/** A standalone MCP server installed by Discover/Stacks (no owning agent). */
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
});
export type Lockfile = z.infer<typeof lockfileSchema>;

const EMPTY: Lockfile = { lockfileVersion: 1, agents: {}, mcpServers: {} };

/** Read and validate the lockfile, returning an empty one if absent/corrupt. */
export async function readLock(): Promise<Lockfile> {
  const raw = await readIfExists(lockfilePath());
  if (!raw) return structuredClone(EMPTY);
  try {
    return lockfileSchema.parse(JSON.parse(raw));
  } catch {
    return structuredClone(EMPTY);
  }
}

/** Write the lockfile atomically. */
export async function writeLock(lock: Lockfile): Promise<void> {
  await atomicWrite(lockfilePath(), JSON.stringify(lock, null, 2) + "\n");
}

/** Insert or update an agent entry. `now` is injected for determinism. */
export async function upsertAgent(spec: AgentSpec, now: string): Promise<void> {
  const lock = await readLock();
  lock.agents[spec.name] = { spec, installedAt: now };
  await writeLock(lock);
}

/** Remove an agent entry by name. Returns true if it existed. */
export async function removeAgentEntry(name: string): Promise<boolean> {
  const lock = await readLock();
  if (!(name in lock.agents)) return false;
  delete lock.agents[name];
  await writeLock(lock);
  return true;
}

/** Get a single agent's spec from the lockfile, or null. */
export async function getAgentSpec(name: string): Promise<AgentSpec | null> {
  const lock = await readLock();
  return lock.agents[name]?.spec ?? null;
}

/** All recorded agent entries as an array. */
export async function listEntries(): Promise<LockEntry[]> {
  const lock = await readLock();
  return Object.values(lock.agents);
}

/** Insert or update a standalone MCP server entry. */
export async function upsertMcpEntry(
  id: string,
  name: string,
  dependency: McpDependency,
  targets: ToolId[],
  now: string,
): Promise<void> {
  const lock = await readLock();
  lock.mcpServers[id] = { id, name, dependency, targets, installedAt: now };
  await writeLock(lock);
}

/** Remove a standalone MCP server entry by id. Returns true if it existed. */
export async function removeMcpEntry(id: string): Promise<boolean> {
  const lock = await readLock();
  if (!(id in lock.mcpServers)) return false;
  delete lock.mcpServers[id];
  await writeLock(lock);
  return true;
}

/** Get a single MCP server entry by id, or null. */
export async function getMcpEntry(id: string): Promise<McpEntry | null> {
  const lock = await readLock();
  return lock.mcpServers[id] ?? null;
}

/** All recorded MCP server entries as an array. */
export async function listMcpEntries(): Promise<McpEntry[]> {
  const lock = await readLock();
  return Object.values(lock.mcpServers);
}
