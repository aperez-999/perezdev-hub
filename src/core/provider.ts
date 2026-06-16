import type { OllamaStatus } from "./ollama.js";

/** The active inference backend, chosen local-first with a cloud fallback. */
export type Provider =
  | { kind: "local"; model: string; label: string; status: string }
  | { kind: "cloud"; vendor: "anthropic" | "openai"; model: string; label: string; status: string }
  | { kind: "none"; label: string; status: string; reason: string };

const CLOUD = {
  anthropic: { model: "claude-sonnet-4-6", label: "claude-sonnet-4-6" },
  openai: { model: "gpt-4o-mini", label: "gpt-4o-mini" },
};

function cloudProvider(): Provider | null {
  if (process.env.ANTHROPIC_API_KEY) {
    return { kind: "cloud", vendor: "anthropic", ...CLOUD.anthropic, status: "cloud active" };
  }
  if (process.env.OPENAI_API_KEY) {
    return { kind: "cloud", vendor: "openai", ...CLOUD.openai, status: "cloud active" };
  }
  return null;
}

/**
 * Pick the backend: a local Ollama model if one is pulled, else a cloud model
 * if an API key is present, else nothing (with a reason for the footer).
 * `prefer: "cloud"` flips the order — a cloud key wins even when Ollama is up
 * (honors `.perezdevrc` `default_provider`); it still falls back to local.
 */
export function resolveProvider(
  status: OllamaStatus,
  slot: "normal" | "thinking" = "normal",
  prefer?: "local" | "cloud",
): Provider {
  const local = slot === "thinking" ? status.thinking : status.normal;
  const localProvider: Provider | null =
    status.available && local ? { kind: "local", model: local, label: local, status: "ollama up" } : null;

  if (prefer === "cloud") {
    const cloud = cloudProvider();
    if (cloud) return cloud;
    if (localProvider) return localProvider;
  } else {
    if (localProvider) return localProvider;
    const cloud = cloudProvider();
    if (cloud) return cloud;
  }

  if (status.available) return { kind: "none", label: "no-model", status: "no models found", reason: "no-models" };
  return { kind: "none", label: "no-model", status: "ollama down", reason: "offline" };
}

/** Friendly, actionable message for a non-working backend. */
export function providerHint(p: Provider): string {
  if (p.kind !== "none") return "";
  if (p.reason === "no-models") return "Ollama is running but no models are pulled. Try /pull qwen2.5-coder";
  return "Ollama isn't running. Start the app (or `ollama serve`), or set ANTHROPIC_API_KEY / OPENAI_API_KEY for cloud.";
}
