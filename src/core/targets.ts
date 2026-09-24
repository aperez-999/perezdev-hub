import { TOOL_IDS, type ToolId } from "./agent-spec.js";
import { detectedTools } from "../adapters/tools.js";
import { loadRc } from "./rc.js";
import { userScope, type Scope } from "./scope.js";

/** Where a resolved target list came from — lets callers decide whether to prompt. */
export type TargetSource = "flag" | "rc" | "detected" | "all";

export interface ResolvedTargets {
  targets: ToolId[];
  source: TargetSource;
}

/** Parse a comma-separated tool-id list. Unknown ids are an error, not silently dropped. */
export function parseTargetCsv(csv?: string): ToolId[] | undefined {
  if (!csv) return undefined;
  const ids = csv.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = ids.filter((s) => !(TOOL_IDS as readonly string[]).includes(s));
  if (unknown.length > 0) throw new Error(`unknown tool(s): ${unknown.join(", ")} — expected ${TOOL_IDS.join(", ")}`);
  return ids.length > 0 ? (ids as ToolId[]) : undefined;
}

/**
 * Resolve install targets with a clear precedence:
 * `--target` flag → `~/.perezdevrc` `default_targets` → tools in use at this
 * scope (for a project: its own config dirs, else what's installed on this
 * machine) → every tool. `source` tells interactive commands whether a choice
 * was already made so they can skip the prompt.
 */
export async function resolveTargets(scope: Scope, csv?: string): Promise<ResolvedTargets> {
  const flag = parseTargetCsv(csv);
  if (flag) return { targets: flag, source: "flag" };

  const rc = await loadRc();
  if (rc.default_targets && rc.default_targets.length > 0) return { targets: rc.default_targets, source: "rc" };

  let ids = await detectedTools(scope);
  if (ids.length === 0 && scope.kind === "project") ids = await detectedTools(userScope());
  if (ids.length > 0) return { targets: ids, source: "detected" };

  return { targets: [...TOOL_IDS], source: "all" };
}
