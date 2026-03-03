import { CLI_AGENTS, type RegistryAgent } from "./agents.js";
import { MCP_SERVERS, type RegistryMcpServer } from "./mcp-servers.js";
import { STACKS, type Stack } from "./stacks.js";
import { getPreset } from "../core/presets.js";

export { CLI_AGENTS, MCP_SERVERS, STACKS };
export type { RegistryAgent, RegistryMcpServer, Stack };

/**
 * Single access point for the bundled catalog. A future remote-refresh feature
 * would merge fetched entries in here without changing call sites.
 */

export function getCliAgent(id: string): RegistryAgent | undefined {
  return CLI_AGENTS.find((a) => a.id === id);
}

export function getMcpServer(id: string): RegistryMcpServer | undefined {
  return MCP_SERVERS.find((m) => m.id === id);
}

export function getStack(id: string): Stack | undefined {
  return STACKS.find((s) => s.id === id);
}

/**
 * Validate that every stack references real presets and MCP servers. Returns a
 * list of human-readable problems (empty when the catalog is internally
 * consistent). Used by a test to guard against dangling references.
 */
export function validateCatalog(): string[] {
  const problems: string[] = [];
  for (const stack of STACKS) {
    for (const presetId of stack.skillPresets) {
      if (!getPreset(presetId)) problems.push(`stack '${stack.id}': unknown preset '${presetId}'`);
    }
    for (const mcpId of stack.mcpServers) {
      if (!getMcpServer(mcpId)) problems.push(`stack '${stack.id}': unknown MCP server '${mcpId}'`);
    }
  }
  return problems;
}
