import type { Engine } from "../engine/bridge.js";
import { detectOllama, promptModel } from "./ollama.js";
import { resolveProvider, providerHint } from "./provider.js";
import { promptAnthropic, promptOpenAI } from "./cloud.js";

export interface ProviderCallOpts {
  system?: string;
  onToken?: (t: string) => void;
  slot?: "normal" | "thinking";
}

/**
 * Resolve the active backend (local Ollama → cloud key → none) and run a prompt.
 * Throws a friendly hint when nothing is available. Shared by the CLI; the TUI
 * keeps its own cached-status path.
 */
export async function promptActiveProvider(engine: Engine, prompt: string, opts: ProviderCallOpts = {}): Promise<string> {
  const status = await detectOllama(engine);
  const p = resolveProvider(status, opts.slot ?? "normal");
  if (p.kind === "none") throw new Error(providerHint(p));
  if (p.kind === "local") return promptModel(engine, p.model, prompt, { system: opts.system, onToken: opts.onToken });
  if (p.vendor === "anthropic") return promptAnthropic(p.model, prompt, { system: opts.system, onToken: opts.onToken });
  return promptOpenAI(p.model, prompt, { system: opts.system, onToken: opts.onToken });
}
