import type { ToolId } from "./agent-spec.js";

export interface ToolPresence {
  id: ToolId;
  name: string;
  present: boolean;
}

export type StarterPack = "superpowers" | "generate" | "empty";

export const STARTER_PACKS: { id: StarterPack; label: string; hint: string }[] = [
  { id: "superpowers", label: "Superpowers SDLC", hint: "install obra/superpowers skills into chosen tools" },
  { id: "generate", label: "Generate in hub", hint: "open Skills with the goal field focused" },
  { id: "empty", label: "Empty hub", hint: "just Chat" },
];

/** Present tools start selected. None present → none selected (user toggles). */
export function initialSelected(tools: ToolPresence[]): ToolId[] {
  return tools.filter((t) => t.present).map((t) => t.id);
}

export function toggleId<T>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Selected write-targets whose apps are not on this machine. */
export function missingSelected(tools: ToolPresence[], selected: ToolId[]): ToolPresence[] {
  const set = new Set(selected);
  return tools.filter((t) => set.has(t.id) && !t.present);
}

/** Offer filesystem + git when the cwd looks like a real project. */
export function shouldOfferCoreMcp(scan: { git?: boolean; languages?: string[] }): boolean {
  return Boolean(scan.git) || (scan.languages?.length ?? 0) > 0;
}

/** Lightweight Ollama probe — no Python engine. */
export async function probeOllama(fetcher: typeof fetch = fetch): Promise<{ up: boolean; model?: string }> {
  try {
    const res = await fetcher("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { up: false };
    const j = (await res.json()) as { models?: { name?: string }[] };
    const name = Array.isArray(j.models) ? j.models[0]?.name : undefined;
    return { up: true, model: typeof name === "string" ? name : undefined };
  } catch {
    return { up: false };
  }
}
