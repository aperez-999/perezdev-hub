import pc from "picocolors";
import { applyPlan, type Plan } from "../core/install.js";
import { displayPath } from "../core/scope.js";
import { toolName } from "../adapters/tools.js";
import { guardCancel, isInteractive, p, renderDiff } from "./prompts.js";

export interface ApplyOptions {
  yes?: boolean;
  dryRun?: boolean;
  force?: boolean;
}

/** Everything a plan would do, as one note body. */
export function describePlan(plan: Plan): string {
  const parts: string[] = [];
  if (plan.writes.length > 0) parts.push(renderDiff(plan.scope, plan.writes));
  for (const path of plan.deletes) parts.push(`${pc.red("delete")} ${pc.bold(displayPath(plan.scope, path))}`);
  for (const path of plan.conflicts) {
    parts.push(pc.yellow(`! ${displayPath(plan.scope, path)} exists and wasn't created by perezdev`));
  }
  for (const s of plan.skipped) parts.push(pc.dim(`skip ${s.name} → ${toolName(s.tool)}: ${s.reason}`));
  return parts.join("\n");
}

/**
 * Preview a plan, ask (unless `--yes` or non-interactive), then apply it.
 * Returns true when files were written.
 */
export async function confirmAndApply(plan: Plan, question: string, opts: ApplyOptions = {}): Promise<boolean> {
  const body = describePlan(plan);
  const changes = plan.writes.length + plan.deletes.length;

  if (opts.dryRun) {
    p.note(body || pc.dim("no file changes"), "Plan");
    p.outro(pc.dim("dry run — nothing written."));
    return false;
  }
  if (plan.conflicts.length > 0 && !opts.force) {
    p.note(body, "Plan");
    p.cancel(`${plan.conflicts.length} file(s) in the way. Rename the agent, move them, or re-run with --force.`);
    process.exit(1);
  }
  if (changes > 0 && !opts.yes && isInteractive()) {
    p.note(body, "Plan");
    const ok = guardCancel(await p.confirm({ message: question }));
    if (!ok) {
      p.cancel("Nothing written.");
      process.exit(0);
    }
  } else if (plan.skipped.length > 0) {
    for (const s of plan.skipped) p.log.warn(`${s.name} → ${toolName(s.tool)}: ${s.reason}`);
  }

  await applyPlan(plan, { force: opts.force });
  if (changes > 0 && (opts.yes || !isInteractive())) {
    for (const w of plan.writes) p.log.step(`${w.previous === null ? "created" : "updated"} ${displayPath(plan.scope, w.path)}`);
    for (const d of plan.deletes) p.log.step(`deleted ${displayPath(plan.scope, d)}`);
  }
  return changes > 0;
}
