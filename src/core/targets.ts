import { TOOL_IDS, type ToolId } from "./agent-spec.js";
import { detectAll } from "../adapters/registry.js";
import { loadRc } from "./rc.js";

/** Where a resolved target list came from — lets callers decide whether to prompt. */
export type TargetSource = "flag" | "rc" | "detected" | "all";

export interface ResolvedTargets {
  targets: ToolId[];
  source: TargetSource;
}

/** Parse a comma-separated tool-id list, keeping only valid ids. Empty → undefined. */
export function parseTargetCsv(csv?: string): ToolId[] | undefined {
  if (!csv) return undefined;
  const ids = csv
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ToolId => (TOOL_IDS as readonly string[]).includes(s));
  return ids.length > 0 ? ids : undefined;
}

/**
 * Resolve install targets with a clear precedence:
 * explicit `--target` flag → `.perezdevrc` `default_targets` → detected tools → all tools.
 * The `source` tells interactive commands whether a choice was already made
 * (flag/rc) so they can skip the target prompt.
 */
export async function resolveTargets(csv?: string): Promise<ResolvedTargets> {
  const flag = parseTargetCsv(csv);
  if (flag) return { targets: flag, source: "flag" };

  const rc = await loadRc();
  if (rc.default_targets && rc.default_targets.length > 0) {
    return { targets: rc.default_targets, source: "rc" };
  }

  const detected = await detectAll();
  const ids = detected.filter((d) => d.detection.installed).map((d) => d.adapter.id);
  if (ids.length > 0) return { targets: ids, source: "detected" };

  return { targets: [...TOOL_IDS], source: "all" };
}
