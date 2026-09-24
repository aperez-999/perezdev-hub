import type { AgentSpec, ToolId } from "./agent-spec.js";
import { getPreset } from "./presets.js";
import { generateSpec } from "./generate.js";
import { toStandalone, type Changes } from "./install.js";
import { getMcpServer, type Stack } from "../registry/index.js";

/** Resolve a stack's preset ids to validated agent specs. */
function stackSpecs(stack: Stack, targets: ToolId[]): AgentSpec[] {
  return stack.skillPresets
    .map((id) => getPreset(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((preset) => generateSpec({ ...preset.input, targets }));
}

/** The changes installing a stack makes: its skill presets as agents, plus its MCP servers. */
export function stackChanges(stack: Stack, targets: ToolId[]): Changes {
  return {
    agents: stackSpecs(stack, targets),
    mcp: stack.mcpServers
      .map((id) => getMcpServer(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((server) => toStandalone(server, targets)),
  };
}
