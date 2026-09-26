import pc from "picocolors";
import { listEntries, getAgentSpec, readLock } from "../core/lockfile.js";
import { bumpPatch, planChanges } from "../core/install.js";
import { resolveScope, type ScopeOptions } from "../core/scope.js";
import { confirmAndApply, type ApplyOptions } from "../ui/apply.js";
import { p, intro } from "../ui/prompts.js";

export interface UpdateOptions extends ScopeOptions, ApplyOptions {
  bump?: boolean;
}

/**
 * Regenerate tool files from the lockfile — one agent, or all of them. This is
 * also how a teammate's lockfile change reaches your tools (`perezdev sync`).
 */
export async function runUpdate(name: string | undefined, opts: UpdateOptions = {}): Promise<void> {
  const scope = await resolveScope(opts);
  intro("sync", scope);

  const found = name ? await getAgentSpec(scope, name) : null;
  if (name && !found) {
    p.cancel(`No agent named '${name}'. Run ${pc.cyan("perezdev list")}.`);
    process.exit(1);
  }
  const specs = (found ? [found] : (await listEntries(scope)).map((e) => e.spec)).map((s) =>
    opts.bump ? { ...s, version: bumpPatch(s.version) } : s,
  );
  if (specs.length === 0 && !(await readLock(scope)).agentsMd) {
    p.outro("Nothing to sync — no agents recorded.");
    return;
  }

  const plan = await planChanges(scope, { agents: specs });
  const wrote = await confirmAndApply(plan, `Rewrite ${plan.writes.length + plan.deletes.length} file(s)?`, opts);
  if (opts.dryRun) return;
  p.outro(wrote ? `${pc.green("✓")} Synced.` : `${pc.green("✓")} Everything already matches the lockfile.`);
}
