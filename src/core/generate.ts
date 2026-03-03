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

const cap = (s: string): string => (s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s);
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
  "Clarify the goal and gather context — read the relevant files before acting.",
  "Plan the work as small, verifiable steps.",
  "Execute one step at a time, staying within the requested scope.",
  "Verify each step (run it, test it, or inspect the result).",
  "Report what changed, how to verify it, and any follow-ups.",
];
const GENERIC_DONE = [
  "The stated goal is achieved and verified",
  "No unrelated changes were introduced",
  "Behavior is confirmed (tests pass or output checked)",
];

// Deterministic instruction body (no LLM): numbered Workflow + Definition of done
// + Output + Guardrails. Behaviors lead; domain inference layers in tailored steps.
export function templateInstructions(input: GenerateInput): string {
  const inferred = inferDomains([input.name, input.description, ...input.behaviors].join(" "));

  const responsibilities = dedupe([
    ...(input.behaviors.length > 0 ? input.behaviors : [cap(input.description)]),
    ...inferred.responsibilities,
  ]).slice(0, 8);

  const workflow = (inferred.workflow.length > 0 ? dedupe(inferred.workflow) : GENERIC_WORKFLOW).slice(0, 8);

  const guidelines = dedupe([
    "Be precise and concise; prefer concrete actions over explanation",
    "Follow the project's existing conventions and patterns",
    ...inferred.guidelines,
    "Ask for clarification only when genuinely blocked",
  ]);

  const done = dedupe([...(inferred.done.length > 0 ? inferred.done : GENERIC_DONE)]);

  const lines: string[] = [];
  lines.push(`You are ${input.role}.`);
  lines.push("");
  lines.push(`Your job: ${period(lowerFirst(input.description))}`);

  section(lines, "When to use", [
    `Use this skill to ${lowerFirst(period(input.description))}`,
    "Activate automatically whenever the task matches that description — don't wait to be asked step by step.",
  ]);

  section(lines, "Responsibilities", responsibilities.map((r) => `- ${r}`));

  // Numbered workflow — the backbone of automation.
  lines.push("");
  lines.push("## Workflow");
  lines.push("");
  lines.push("Follow these steps end to end. Complete the task fully before yielding back:");
  lines.push("");
  workflow.forEach((step, i) => lines.push(`${i + 1}. ${period(step)}`));

  section(lines, "Guidelines", [
    ...guidelines.map((g) => `- ${g}`),
    ...(input.allowedTools.length > 0 ? [`- Use these tools when helpful: ${input.allowedTools.join(", ")}`] : []),
  ]);

  section(lines, "Definition of done", done.map((d) => `- ${d}`));

  section(lines, "Output", [
    "Report what you did, the files you changed, and exactly how to verify the result.",
    "Lead with the outcome; keep it skimmable.",
  ]);

  section(lines, "Guardrails", [
    "- Stay within the requested scope; flag anything larger before doing it.",
    "- Do not run destructive or irreversible commands without explicit confirmation.",
    "- Make only changes that serve the stated goal.",
  ]);

  if (input.mcpDependencies.length > 0) {
    section(lines, "MCP servers", [
      "This skill relies on the following MCP servers (installed alongside it):",
      "",
      ...input.mcpDependencies.map((m) => `- \`${m.name}\` — \`${[m.command, ...m.args].join(" ")}\``),
    ]);
  }

  return lines.join("\n");
}

/** Append a `## heading` + blank line + body lines. */
function section(lines: string[], heading: string, body: string[]): void {
  lines.push("");
  lines.push(`## ${heading}`);
  lines.push("");
  lines.push(...body);
}

const lowerFirst = (s: string): string => (s.length ? s.charAt(0).toLowerCase() + s.slice(1) : s);

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
