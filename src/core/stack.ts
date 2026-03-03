import type { ToolId } from "./agent-spec.js";
import type { PlannedFile } from "../adapters/types.js";
import { getPreset } from "./presets.js";
import { generateSpec } from "./generate.js";
import { installSpec, planSpec } from "./install.js";
import { installMcpServer, planMcpServer } from "./mcp-install.js";
import { getMcpServer, getStack, type Stack } from "../registry/index.js";

/** Resolve a stack's preset ids to validated agent specs. */
function stackSpecs(stack: Stack, targets: ToolId[]) {
  return stack.skillPresets
    .map((id) => getPreset(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((preset) => generateSpec({ ...preset.input, targets }));
}

/** Resolve a stack's MCP ids to catalog servers. */
function stackServers(stack: Stack) {
  return stack.mcpServers.map((id) => getMcpServer(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
}

/** Plan every file a stack install would write, for a single diff preview. */
export async function planStack(stack: Stack, targets: ToolId[]): Promise<PlannedFile[]> {
  const files: PlannedFile[] = [];
  for (const spec of stackSpecs(stack, targets)) files.push(...(await planSpec(spec)));
  for (const server of stackServers(stack)) files.push(...(await planMcpServer(server, targets)));
  return files;
}

export interface StackInstallResult {
  agents: string[];
  mcpServers: string[];
}

/** Install a stack: skill presets (as agents) + MCP servers, across targets. */
export async function installStack(
  stackId: string,
  targets: ToolId[],
  now: string,
): Promise<StackInstallResult> {
  const stack = getStack(stackId);
  if (!stack) throw new Error(`unknown stack: ${stackId}`);

  const specs = stackSpecs(stack, targets);
  for (const spec of specs) await installSpec(spec, now);

  const servers = stackServers(stack);
  for (const server of servers) await installMcpServer(server, targets, now);

  return { agents: specs.map((s) => s.name), mcpServers: servers.map((s) => s.id) };
}
