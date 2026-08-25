import type { Engine } from "../engine/bridge.js";
import { detectOllama, promptModel } from "./ollama.js";
import type { OllamaBudget, ThinkDepth } from "./ollama.js";
import { resolveProvider, providerHint } from "./provider.js";
import { promptAnthropic, promptOpenAI } from "./cloud.js";
import { loadRc } from "./rc.js";

export interface ProviderCallOpts {
  system?: string;
  onToken?: (t: string) => void;
  slot?: "normal" | "thinking";
  thinking?: ThinkDepth;
  budget?: OllamaBudget;
}

/**
 * Resolve the active backend (local Ollama → cloud key → none) and run a prompt.
 * Throws a friendly hint when nothing is available. Shared by the CLI; the TUI
 * keeps its own cached-status path.
 */
export async function promptActiveProvider(engine: Engine, prompt: string, opts: ProviderCallOpts = {}): Promise<string> {
  const status = await detectOllama(engine);
  const { default_provider } = await loadRc();
  const p = resolveProvider(status, opts.slot ?? "normal", default_provider);
  if (p.kind === "none") throw new Error(providerHint(p));
  if (p.kind === "local") {
    return promptModel(engine, p.model, prompt, {
      system: opts.system,
      onToken: opts.onToken,
      thinking: opts.thinking,
      budget: opts.budget,
    });
  }
  if (p.vendor === "anthropic") return promptAnthropic(p.model, prompt, { system: opts.system, onToken: opts.onToken });
  return promptOpenAI(p.model, prompt, { system: opts.system, onToken: opts.onToken });
}
