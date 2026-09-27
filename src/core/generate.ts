import { parseAgentSpec, type AgentSpec, type McpDependency, type ToolId } from "./agent-spec.js";
import { inferDomains } from "./domains.js";

/** Raw answers collected from the `create` wizard. */
export interface GenerateInput {
  name: string;
  role: string;
  /** "When to use" trigger / description. */
  description: string;
  /** Short bullet behaviors the user typed. */
  behaviors: string[];
  allowedTools: string[];
  mcpDependencies: McpDependency[];
  targets: ToolId[];
}

const period = (s: string): string => s.replace(/\s*\.?$/, ".");

/** Dedupe a list of bullet strings case-insensitively, preserving order. */
function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = period(raw.trim());
    const key = item.toLowerCase();
    if (item.length > 1 && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/** Generic fallbacks used when domain inference finds nothing specific. */
const GENERIC_WORKFLOW = [
  "Read the relevant files before acting.",
  "Plan the work as small, verifiable steps.",
  "Make one change at a time and verify it (run it, test it, or inspect the result).",
  "Report what changed and how to verify it.",
];
const GENERIC_DONE = ["The stated goal is achieved and verified", "No unrelated changes were introduced"];

/**
 * Deterministic instruction body (no LLM). The frontmatter description already
 * says when to use the agent, so the body is only what's specific to the job:
 * focus areas, a numbered workflow, guidelines, and a done check — each
 * section omitted when there's nothing specific to put in it.
 */
export function templateInstructions(input: GenerateInput): string {
  const inferred = inferDomains([input.name, input.description, ...input.behaviors].join(" "));
  const focus = dedupe([...input.behaviors, ...inferred.responsibilities]).slice(0, 8);
  const workflow = (inferred.workflow.length > 0 ? dedupe(inferred.workflow) : GENERIC_WORKFLOW).slice(0, 8);
  const guidelines = dedupe(inferred.guidelines);
  const done = dedupe(inferred.done.length > 0 ? inferred.done : GENERIC_DONE);

  const lines: string[] = [`You are ${input.role}.`];
  if (focus.length > 0) section(lines, "Focus", focus.map((r) => `- ${r}`));
  section(lines, "Workflow", workflow.map((step, i) => `${i + 1}. ${period(step)}`));
  const tools = input.allowedTools.length > 0 ? [`- Tools: ${input.allowedTools.join(", ")}.`] : [];
  if (guidelines.length + tools.length > 0) section(lines, "Guidelines", [...guidelines.map((g) => `- ${g}`), ...tools]);
  section(lines, "Done when", done.map((d) => `- ${d}`));

  if (input.mcpDependencies.length > 0) {
    section(lines, "MCP servers", input.mcpDependencies.map((m) => `- \`${m.name}\` — \`${[m.command, ...m.args].join(" ")}\``));
  }
  return lines.join("\n");
}

/** Append a `## heading` + blank line + body lines. */
function section(lines: string[], heading: string, body: string[]): void {
  lines.push("", `## ${heading}`, "", ...body);
}

/**
 * Build a validated AgentSpec from wizard input. When `instructionsOverride`
 * is provided (e.g. from the LLM synthesizer) it replaces the template body.
 */
export function generateSpec(input: GenerateInput, instructionsOverride?: string): AgentSpec {
  const instructions = instructionsOverride?.trim() || templateInstructions(input);
  return parseAgentSpec({
    name: input.name,
    description: input.description,
    role: input.role,
    instructions,
    allowedTools: input.allowedTools,
    mcpDependencies: input.mcpDependencies,
    targets: input.targets,
    source: "generated",
  } satisfies Partial<AgentSpec> & Record<string, unknown>);
}
