import type { AgentSpec, ToolId } from "../core/agent-spec.js";
import { TOOL_IDS } from "../core/agent-spec.js";
import { detectAll, getAdapter } from "../adapters/registry.js";
import { listEntries, listMcpEntries, removeAgentEntry, type McpEntry } from "../core/lockfile.js";
import { installSpec, bumpPatch } from "../core/install.js";
import { generateSpec, type GenerateInput } from "../core/generate.js";
import { installMcpServer, removeMcpServer } from "../core/mcp-install.js";
import { scanProject, type ProjectScan } from "../core/scan.js";
import { recommend, type AgentProposal, type McpSuggestion } from "../core/recommend.js";
import { hasAnthropicKey } from "../core/config.js";
import { synthesizeInstructions } from "../llm/synthesize.js";
import { CLI_AGENTS, MCP_SERVERS, getMcpServer, type RegistryAgent, type RegistryMcpServer } from "../registry/index.js";

export interface ToolBadge {
  id: ToolId;
  name: string;
  installed: boolean;
}

export interface InstalledAgent {
  name: string;
  targets: ToolId[];
  version: string;
  spec: AgentSpec;
}

export interface HomeData {
  tools: ToolBadge[];
  targets: ToolId[];
  scan: ProjectScan;
  proposals: AgentProposal[];
  mcpSuggestions: McpSuggestion[];
  agents: InstalledAgent[];
  mcp: McpEntry[];
  aiMode: boolean;
}

export const catalogMcp: RegistryMcpServer[] = MCP_SERVERS;
export const catalogCli: RegistryAgent[] = CLI_AGENTS;

/** Load everything the TUI needs: tools, project scan, recommendations, installed. */
export async function loadHome(): Promise<HomeData> {
  const detected = await detectAll();
  const tools: ToolBadge[] = detected.map((d) => ({
    id: d.adapter.id,
    name: d.adapter.displayName,
    installed: d.detection.installed,
  }));
  const installedIds = tools.filter((t) => t.installed).map((t) => t.id);
  const targets: ToolId[] = installedIds.length > 0 ? installedIds : [...TOOL_IDS];

  const scan = await scanProject();
  const entries = await listEntries();
  const mcpEntries = await listMcpEntries();
  const recs = recommend(
    scan,
    new Set(entries.map((e) => e.spec.name)),
    new Set(mcpEntries.map((m) => m.id)),
  );

  return {
    tools,
    targets,
    scan,
    proposals: recs.agents,
    mcpSuggestions: recs.mcp,
    agents: entries.map((e) => ({
      name: e.spec.name,
      targets: e.spec.targets,
      version: e.spec.version,
      spec: e.spec,
    })),
    mcp: mcpEntries,
    aiMode: hasAnthropicKey(),
  };
}

/** Generate (LLM when a key exists, else template) and install an agent proposal. */
export async function installProposal(proposal: AgentProposal, targets: ToolId[]): Promise<void> {
  const input: GenerateInput = {
    name: proposal.name,
    role: proposal.role,
    description: proposal.description,
    behaviors: [],
    allowedTools: proposal.allowedTools,
    mcpDependencies: [],
    targets,
  };
  const override = hasAnthropicKey() ? (await synthesizeInstructions(input)) ?? undefined : undefined;
  await installSpec(generateSpec(input, override), new Date().toISOString());
}

const VOWEL = /^[aeiou]/i;

/** Expand a terse role-like input ("frontend dev") into a usable description sentence. */
export function expandPurpose(purpose: string): string {
  const p = purpose.trim();
  const roleLike = p.split(/\s+/).length <= 4 && !/[.!?]$/.test(p) && !/\b(when|use|that|which|to)\b/i.test(p);
  if (!roleLike) return p;
  const article = VOWEL.test(p) ? "an" : "a";
  return `act as ${article} ${p} — own the design, implementation, and review of work in that domain`;
}

/** Generate + install a custom agent from a free-text description. */
export async function installDescribed(name: string, purpose: string, targets: ToolId[]): Promise<void> {
  const role = `${VOWEL.test(purpose.trim()) ? "an" : "a"} ${purpose.trim()} specialist`;
  const input: GenerateInput = {
    name,
    role,
    description: expandPurpose(purpose),
    behaviors: [],
    allowedTools: [],
    mcpDependencies: [],
    targets,
  };
  const override = hasAnthropicKey() ? (await synthesizeInstructions(input)) ?? undefined : undefined;
  await installSpec(generateSpec(input, override), new Date().toISOString());
}

export async function installCatalogMcp(server: RegistryMcpServer, targets: ToolId[]): Promise<void> {
  await installMcpServer(server, targets, new Date().toISOString());
}

export async function removeAgent(agent: InstalledAgent): Promise<void> {
  for (const t of agent.spec.targets) await getAdapter(t).remove(agent.spec);
  await removeAgentEntry(agent.name);
}

export async function removeMcp(id: string): Promise<void> {
  await removeMcpServer(id);
}

export async function updateInstalled(spec: AgentSpec, bump: boolean): Promise<void> {
  const next = bump ? { ...spec, version: bumpPatch(spec.version) } : spec;
  await installSpec(next, new Date().toISOString());
}

export { getMcpServer };

// --- Local Python engine (runtime tools) ---
import { engineRequest } from "../engine/bridge.js";

export interface TreeResult {
  tree: string;
  count: number;
}
export interface Diagnosis {
  message: string;
  kind: string;
  hint: string;
  frames: { file: string; line: number; snippet: string | null }[];
}

export const engineMap = (dir: string, depth = 2): Promise<TreeResult> =>
  engineRequest<TreeResult>("filetree", { dir, depth });

export const engineDiagnose = (file: string): Promise<Diagnosis> =>
  engineRequest<Diagnosis>("diagnose", { file });
