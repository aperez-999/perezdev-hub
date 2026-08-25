import type { AgentSpec, ToolId } from "../core/agent-spec.js";
import { TOOL_IDS } from "../core/agent-spec.js";
import { detectAll, getAdapter } from "../adapters/registry.js";
import { listEntries, listMcpEntries, type McpEntry } from "../core/lockfile.js";
import { installSpec, planSpec } from "../core/install.js";
import { generateSpec, type GenerateInput } from "../core/generate.js";
import { installMcpServer, planMcpServer } from "../core/mcp-install.js";
import type { PlannedFile } from "../adapters/types.js";
import { scanProject, type ProjectScan } from "../core/scan.js";
import { scanEcosystem, type EcoTool } from "../core/ecosystem.js";
import { recommend, type AgentProposal, type McpSuggestion } from "../core/recommend.js";
import { hasAnthropicKey } from "../core/config.js";
import { synthesizeInstructions } from "../llm/synthesize.js";
import { MCP_SERVERS, getMcpServer, type RegistryMcpServer } from "../registry/index.js";

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
  ecosystem: EcoTool[];
  targets: ToolId[];
  scan: ProjectScan;
  proposals: AgentProposal[];
  mcpSuggestions: McpSuggestion[];
  agents: InstalledAgent[];
  mcp: McpEntry[];
  aiMode: boolean;
}

export const catalogMcp: RegistryMcpServer[] = MCP_SERVERS;

/** Load everything the TUI needs: tools, project scan, recommendations, installed. */
export async function loadHome(): Promise<HomeData> {
  const [detected, scan, ecosystem, entries, mcpEntries] = await Promise.all([
    detectAll(),
    scanProject(),
    scanEcosystem(),
    listEntries(),
    listMcpEntries(),
  ]);
  const tools: ToolBadge[] = detected.map((d) => ({
    id: d.adapter.id,
    name: d.adapter.displayName,
    installed: d.detection.installed,
  }));
  const installedIds = tools.filter((t) => t.installed).map((t) => t.id);
  const targets: ToolId[] = installedIds.length > 0 ? installedIds : [...TOOL_IDS];
  const recs = recommend(
    scan,
    new Set(entries.map((e) => e.spec.name)),
    new Set(mcpEntries.map((m) => m.id)),
  );

  return {
    tools,
    ecosystem,
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
export async function installProposal(proposal: AgentProposal, targets: ToolId[]): Promise<string[]> {
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
  const written = await installSpec(generateSpec(input, override), new Date().toISOString());
  return written.map((f) => f.path);
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

/**
 * Generate + install a custom agent from a free-text description. When
 * `bodyOverride` is supplied (e.g. compiled live by the active LLM provider) it
 * becomes the skill body; otherwise the deterministic template path is used.
 */
export async function installDescribed(
  name: string,
  purpose: string,
  targets: ToolId[],
  bodyOverride?: string,
): Promise<string[]> {
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
  const override =
    bodyOverride?.trim() || (hasAnthropicKey() ? (await synthesizeInstructions(input)) ?? undefined : undefined);
  const written = await installSpec(generateSpec(input, override), new Date().toISOString());
  return written.map((f) => f.path);
}

/** Shorten an absolute path under $HOME to a leading `~`. */
function shortPath(p: string): string {
  const h = process.env.HOME || "";
  return h && p.startsWith(h) ? "~" + p.slice(h.length) : p;
}

/** Turn a planned-file set into colored diff lines (+ new · ~ change). */
export function plannedToDiff(planned: PlannedFile[]): string[] {
  return planned.map((f) => `${f.previous === null ? "+" : "~"} ${shortPath(f.path)}`);
}

/** Compute the files a described-agent build would write, without writing. */
export async function planDescribed(
  name: string,
  purpose: string,
  targets: ToolId[],
  bodyOverride?: string,
): Promise<PlannedFile[]> {
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
  return planSpec(generateSpec(input, bodyOverride?.trim() || undefined));
}

/** Compute the config files a catalog MCP install would touch, without writing. */
export const planCatalogMcp = (server: RegistryMcpServer, targets: ToolId[]): Promise<PlannedFile[]> =>
  planMcpServer(server, targets);

/** Config-file paths an MCP install touched, for the given installed tools. */
function mcpPaths(tools: ToolId[]): string[] {
  return tools.map((t) => getAdapter(t).mcpConfigPath?.()).filter((p): p is string => Boolean(p));
}

/** Install a custom MCP server compiled on the fly (from an LLM intent prompt). */
export async function installCustomMcp(
  id: string,
  description: string,
  config: { command: string; args: string[]; env: Record<string, string> },
  targets: ToolId[],
): Promise<string[]> {
  const server: RegistryMcpServer = {
    id,
    name: id,
    description,
    command: config.command,
    args: config.args,
    tags: ["custom"],
    env: config.env,
  };
  const res = await installMcpServer(server, targets, new Date().toISOString());
  return mcpPaths(res.installedTo);
}

export async function installCatalogMcp(server: RegistryMcpServer, targets: ToolId[]): Promise<string[]> {
  const res = await installMcpServer(server, targets, new Date().toISOString());
  return mcpPaths(res.installedTo);
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
