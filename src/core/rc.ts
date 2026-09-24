import { join } from "node:path";
import { home } from "./config.js";
import { TOOL_IDS, type ToolId } from "./agent-spec.js";
import { readIfExists } from "../util/fs-safe.js";

/** Personal preferences in ~/.perezdevrc (JSON). Hand-edited; perezdev only reads it. */
export interface PerezRc {
  /** Preferred install targets — used when no `--target` flag is given (skips the prompt). */
  default_targets?: ToolId[];
}

/** Path to the preferences file: ~/.perezdevrc */
export function rcPath(): string {
  return join(home(), ".perezdevrc");
}

/** Load preferences, tolerating a missing or corrupt file (returns no preferences). */
export async function loadRc(): Promise<PerezRc> {
  const raw = await readIfExists(rcPath());
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Partial<PerezRc>;
    const targets = Array.isArray(obj.default_targets)
      ? obj.default_targets.filter((t): t is ToolId => (TOOL_IDS as readonly string[]).includes(t))
      : [];
    return targets.length > 0 ? { default_targets: targets } : {};
  } catch {
    return {};
  }
}
