import { Engine } from "../engine/bridge.js";

export type Slot = "normal" | "thinking";
export type ThinkDepth = "low" | "medium" | "high";
/** Chat answers stay short; skill/MCP/autofix writes need more tokens. */
export type OllamaBudget = "chat" | "write";

export const KEEP_ALIVE = "30m";

// Preferred models per slot (first match among pulled models wins).
const PREFS: Record<Slot, string[]> = {
  normal: ["qwen2.5-coder", "qwen2.5", "llama3.2", "llama3.1", "llama3", "codellama", "mistral", "phi4", "gemma2"],
  thinking: ["deepseek-r1", "qwq", "llama3-groq-tool-use", "deepseek-coder"],
};

const PREDICT: Record<ThinkDepth, number> = { low: 256, medium: 512, high: 1536 };
const TEMP: Record<ThinkDepth, number> = { low: 0.2, medium: 0.35, high: 0.7 };

export interface OllamaStatus {
  available: boolean;
  models: string[];
  normal: string | null;
  thinking: string | null;
  error?: string;
}

export interface OllamaGenerateExtras {
  keep_alive: string;
  options: { num_predict: number; temperature: number };
}

/** Token cap + sampling for a prompt. Ctrl+T in the TUI maps onto ThinkDepth. */
export function ollamaGenerateExtras(thinking: ThinkDepth = "medium", budget: OllamaBudget = "chat"): OllamaGenerateExtras {
  const depth: ThinkDepth = budget === "write" && thinking === "low" ? "medium" : thinking;
  return {
    keep_alive: KEEP_ALIVE,
    options: {
      num_predict: budget === "write" ? 2048 : PREDICT[depth],
      temperature: TEMP[depth],
    },
  };
}

/** Match a model family regardless of tag (e.g. "qwen2.5-coder" ~ "qwen2.5-coder:7b"). */
function pick(models: string[], prefs: string[]): string | null {
  for (const pref of prefs) {
    const hit = models.find((m) => m === pref || m.split(":")[0] === pref || m.startsWith(pref));
    if (hit) return hit;
  }
  return models[0] ?? null;
}

/** Detect pulled Ollama models and choose a model for each slot. */
export async function detectOllama(engine?: Engine): Promise<OllamaStatus> {
  const e = engine ?? new Engine();
  try {
    const res = await e.send<{ available: boolean; models: string[]; error?: string }>("ollama_tags", {}, 4000);
    return {
      available: res.available,
      models: res.models,
      normal: pick(res.models, PREFS.normal),
      thinking: pick(res.models, PREFS.thinking),
      error: res.error,
    };
  } catch (err) {
    return { available: false, models: [], normal: null, thinking: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (!engine) e.close();
  }
}

/** Load weights into Ollama RAM so the first real prompt is not a cold start. */
export async function warmupModel(engine: Pick<Engine, "send">, model: string): Promise<void> {
  await engine.send("ollama_load", { model, keep_alive: KEEP_ALIVE }, 120000);
}

export interface PromptOptions {
  system?: string;
  onToken?: (t: string) => void;
  thinking?: ThinkDepth;
  budget?: OllamaBudget;
}

/** Stream a completion from a local model; returns the full response text. */
export async function promptModel(
  engine: Pick<Engine, "send">,
  model: string,
  prompt: string,
  opts: PromptOptions = {},
): Promise<string> {
  const extras = ollamaGenerateExtras(opts.thinking ?? "medium", opts.budget ?? "chat");
  const res = await engine.send<{ response: string }>(
    "ollama_generate",
    { model, prompt, system: opts.system, ...extras },
    600000,
    opts.onToken,
  );
  return res.response;
}

/** Keep chat replies short so local models finish sooner. */
export const CHAT_SYSTEM =
  "You are a local coding assistant inside PerezDev Hub for this repo. Answer directly. Prefer a short answer: a few sentences or a tight list. No preamble and no recap of the question. This hub installs skills into Claude Code, Cursor, Copilot, Codex, Cline, Windsurf, and Roo, and installs MCP servers from its MCP page — do not give generic git-clone setup for those tools.";

export const AUTO_CHAT_SYSTEM =
  "Local auto is on: when the user asks to install an MCP server or generate a skill, say you will do it in the hub rather than dumping a tutorial. Still do not invent shell commands that delete files.";

/** A reasoning-first system prompt for Planning mode. */
export const THINKING_SYSTEM =
  "You are a senior engineer. First lay out a short, numbered plan of the steps you will take, " +
  "then give the concrete answer (commands, code, or edits). Be precise and local-workspace aware.";
