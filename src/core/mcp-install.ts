import type { McpDependency, ToolId } from "./agent-spec.js";
import type { PlannedFile } from "../adapters/types.js";
import { getAdapter } from "../adapters/registry.js";
import { mergeMcpJson, pruneMcpJson } from "../adapters/shared.js";
import { atomicWriteValidated, cacheBackup, readIfExists, validateJson, withRollback } from "../util/fs-safe.js";
import { getMcpEntry, listMcpEntries, removeMcpEntry, upsertMcpEntry } from "./lockfile.js";
import type { RegistryMcpServer } from "../registry/index.js";

/** Convert a catalog MCP server into the MCP dependency form tools store. */
export function toDependency(server: RegistryMcpServer): McpDependency {
  return { name: server.id, command: server.command, args: server.args, env: server.env ?? {} };
}

/** Targets that can host MCP servers, paired with their config path. */
function mcpTargets(targets: ToolId[]): { tool: ToolId; path: string }[] {
  const out: { tool: ToolId; path: string }[] = [];
  for (const tool of targets) {
    const path = getAdapter(tool).mcpConfigPath?.();
    if (path) out.push({ tool, path });
  }
  return out;
}

/** Plan the files a standalone MCP install would write (for diff preview). */
export async function planMcpServer(server: RegistryMcpServer, targets: ToolId[]): Promise<PlannedFile[]> {
  const dep = toDependency(server);
  const files: PlannedFile[] = [];
  for (const { path } of mcpTargets(targets)) {
    files.push({ path, contents: await mergeMcpJson(path, [dep]), previous: await readIfExists(path) });
  }
  return files;
}

export interface McpInstallResult {
  installedTo: ToolId[];
  skipped: ToolId[];
}

/**
 * Install a standalone MCP server (no owning agent) into every MCP-capable
 * target, then record it in the lockfile. Tools without MCP support are
 * skipped and reported.
 */
export async function installMcpServer(
  server: RegistryMcpServer,
  targets: ToolId[],
  now: string,
): Promise<McpInstallResult> {
  const dep = toDependency(server);
  const supported = mcpTargets(targets);
  // Backed-up, validated, all-or-nothing: a bad merge rolls every config back.
  await withRollback(
    supported.map((s) => s.path),
    now,
    async () => {
      for (const { path } of supported) {
        await cacheBackup(path, now);
        await atomicWriteValidated(path, await mergeMcpJson(path, [dep]), validateJson);
      }
    },
  );
  const installedTo = supported.map((s) => s.tool);
  if (installedTo.length > 0) {
    // Union with any previously-recorded targets so re-installing with a
    // narrower target set doesn't drop tools that still hold the server.
    const existing = (await listMcpEntries()).find((e) => e.id === server.id);
    const merged = Array.from(new Set([...(existing?.targets ?? []), ...installedTo]));
    await upsertMcpEntry(server.id, server.name, dep, merged, now);
  }
  return {
    installedTo,
    skipped: targets.filter((t) => !installedTo.includes(t)),
  };
}

/** Remove a previously-installed standalone MCP server across its tools. */
export async function removeMcpServer(id: string): Promise<boolean> {
  const entry = await getMcpEntry(id);
  if (!entry) return false;
  const now = new Date().toISOString();
  for (const { path } of mcpTargets(entry.targets)) {
    const pruned = await pruneMcpJson(path, [entry.dependency]);
    if (pruned !== null) {
      await cacheBackup(path, now);
      await atomicWriteValidated(path, pruned, validateJson);
    }
  }
  await removeMcpEntry(id);
  return true;
}
