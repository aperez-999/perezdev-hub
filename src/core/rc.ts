import { join } from "node:path";
import { home } from "./config.js";
import { TOOL_IDS, type ToolId } from "./agent-spec.js";
import { atomicWriteValidated, readIfExists, validateJson } from "../util/fs-safe.js";

export interface PerezRc {
  /** Tab the user was last on (1 chat · 2 skill builder · 3 mcp manager). */
  last_active_tab: 1 | 2 | 3;
  /** Execution layout left active. */
  autonomy_mode: "manual" | "auto";
  /** MCP servers the user declined during discovery — don't re-prompt. */
  mcp_ignored_servers: string[];
  /** Preferred install targets — used when no `--target` flag is given (skips the prompt). */
  default_targets?: ToolId[];
  /** Preferred inference backend — "cloud" prefers an API key even if Ollama is up. */
  default_provider?: "local" | "cloud";
}

const DEFAULTS: PerezRc = { last_active_tab: 1, autonomy_mode: "manual", mcp_ignored_servers: [] };

/** Path to the global preferences cache: ~/.perezdevrc */
export function rcPath(): string {
  return join(home(), ".perezdevrc");
}

/** Load preferences, tolerating a missing or corrupt file (returns defaults). */
export async function loadRc(): Promise<PerezRc> {
  const raw = await readIfExists(rcPath());
  if (!raw) return { ...DEFAULTS };
  try {
    const obj = JSON.parse(raw) as Partial<PerezRc>;
    const validTargets = Array.isArray(obj.default_targets)
      ? obj.default_targets.filter((t): t is ToolId => (TOOL_IDS as readonly string[]).includes(t))
      : [];
    return {
      last_active_tab: obj.last_active_tab === 2 || obj.last_active_tab === 3 ? obj.last_active_tab : 1,
      autonomy_mode: obj.autonomy_mode === "auto" ? "auto" : "manual",
      mcp_ignored_servers: Array.isArray(obj.mcp_ignored_servers) ? obj.mcp_ignored_servers.map(String) : [],
      ...(validTargets.length ? { default_targets: validTargets } : {}),
      ...(obj.default_provider === "local" || obj.default_provider === "cloud"
        ? { default_provider: obj.default_provider }
        : {}),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Persist preferences atomically (temp-file swap) so a force-quit can't corrupt it. */
export async function saveRc(rc: PerezRc): Promise<void> {
  await atomicWriteValidated(rcPath(), JSON.stringify(rc, null, 2) + "\n", validateJson);
}
