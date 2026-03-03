import { hasAnthropicKey } from "../core/config.js";
import type { GenerateInput } from "../core/generate.js";

/**
 * Optionally expand terse wizard answers into a polished agent instruction
 * body using the Anthropic API. Returns null (so the caller falls back to the
 * deterministic template) whenever the key is absent, the optional SDK is not
 * installed, or the call fails. Never throws — generation must always succeed.
 *
 * The optional `@anthropic-ai/sdk` dependency is loaded dynamically and treated
 * as untyped so the project compiles whether or not it is installed.
 */
export async function synthesizeInstructions(input: GenerateInput): Promise<string | null> {
  if (!hasAnthropicKey()) return null;

  let mod: { default: new () => AnthropicLike };
  try {
    // @ts-expect-error optional dependency, resolved at runtime only
    mod = await import("@anthropic-ai/sdk");
  } catch {
    return null;
  }

  const system = [
    "You author the instruction body of a custom AI coding agent — a SKILL.md that drives full, hands-off automation when the user triggers it.",
    "Write specifically for THIS agent's job. Do not produce generic boilerplate: every section must be concrete to the stated purpose, domain, and stack. If the purpose is about accessibility, talk about ARIA/contrast/keyboard nav — not generic 'review for bugs'.",
    "Output GitHub-flavored markdown only. No YAML frontmatter, no surrounding code fences, no preamble like 'Here is'.",
    "Structure, in this order:",
    "- One sentence stating who the agent is.",
    "- '## When to use' — the trigger conditions.",
    "- '## Responsibilities' — what it owns, specific to the job.",
    "- '## Workflow' — a numbered, end-to-end procedure it follows to complete the task without hand-holding.",
    "- '## Guidelines' — concrete dos/don'ts for this domain.",
    "- '## Definition of done' — checks that prove the task is complete.",
    "- '## Output' — what to report and how.",
    "- '## Guardrails' — scope limits and safety.",
    "Be detailed and accurate. Prefer specific, checkable instructions over vague advice.",
  ].join("\n");

  const userPrompt = [
    `Agent name: ${input.name}`,
    `Role: ${input.role}`,
    `Purpose (when to use): ${input.description}`,
    input.behaviors.length ? `Desired behaviors:\n${input.behaviors.map((b) => `- ${b}`).join("\n")}` : "",
    input.allowedTools.length ? `Tools it may use: ${input.allowedTools.join(", ")}` : "",
    "Write the full, specific instruction body now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const client = new mod.default();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 6000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = (response.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();

    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/** Minimal structural shape of the Anthropic client we rely on. */
interface AnthropicLike {
  messages: {
    create(params: Record<string, unknown>): Promise<{
      content?: Array<{ type: string; text?: string }>;
    }>;
  };
}
