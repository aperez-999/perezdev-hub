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
    "You write the instruction body of a SKILL.md for an AI coding agent. The skill's name and its when-to-use description are stored separately in frontmatter, so don't restate them.",
    "Make every line specific to this agent's job and stack; an accessibility reviewer talks about ARIA, contrast, and keyboard navigation, not generic bug hunting. Leave out advice any competent agent already follows (be concise, follow conventions, ask when blocked).",
    "Output GitHub-flavored markdown only: no frontmatter, no code fence around the whole answer, no preamble.",
    "Structure: one sentence naming the role; '## Focus' (what this agent checks or owns); '## Workflow' (numbered steps that take the task from start to verified finish); '## Guidelines' (domain-specific dos and don'ts, only if there are real ones); '## Done when' (checkable conditions). Skip a section rather than pad it.",
  ].join("\n");

  const userPrompt = [
    `Agent name: ${input.name}`,
    `Role: ${input.role}`,
    `Purpose (when to use): ${input.description}`,
    input.behaviors.length ? `Desired behaviors:\n${input.behaviors.map((b) => `- ${b}`).join("\n")}` : "",
    input.allowedTools.length ? `Tools it may use: ${input.allowedTools.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const client = new mod.default();
    // Thinking is always on for this model; effort is the depth control.
    // On a policy decline the API retries on a fallback model in the same call.
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
    if (response.stop_reason !== "end_turn") return null;

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
  beta: {
    messages: {
      create(params: Record<string, unknown>): Promise<{
        stop_reason?: string;
        content?: Array<{ type: string; text?: string }>;
      }>;
    };
  };
}
