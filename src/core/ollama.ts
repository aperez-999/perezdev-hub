import { Engine } from "../engine/bridge.js";

export type Slot = "normal" | "thinking";

// Preferred models per slot (first match among pulled models wins).
const PREFS: Record<Slot, string[]> = {
  normal: ["qwen2.5-coder", "qwen2.5", "llama3.1", "llama3", "codellama", "mistral"],
  thinking: ["deepseek-r1", "llama3-groq-tool-use", "qwq", "deepseek-coder"],
};

export interface OllamaStatus {
  available: boolean;
  models: string[];
  normal: string | null;
  thinking: string | null;
  error?: string;
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

export interface PromptOptions {
  system?: string;
  onToken?: (t: string) => void;
}

/** Stream a completion from a local model; returns the full response text. */
export async function promptModel(engine: Engine, model: string, prompt: string, opts: PromptOptions = {}): Promise<string> {
  const res = await engine.send<{ response: string }>(
    "ollama_generate",
    { model, prompt, system: opts.system },
    600000,
    opts.onToken,
  );
  return res.response;
}

/** A reasoning-first system prompt for Thinking mode. */
export const THINKING_SYSTEM =
  "You are a senior engineer. First lay out a short, numbered plan of the steps you will take, " +
  "then give the concrete answer (commands, code, or edits). Be precise and local-workspace aware.";
