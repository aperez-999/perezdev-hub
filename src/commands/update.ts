import pc from "picocolors";
import { listEntries, getAgentSpec } from "../core/lockfile.js";
import { installSpec, planSpec, bumpPatch } from "../core/install.js";
import type { AgentSpec } from "../core/agent-spec.js";
import { p, renderDiff } from "../ui/prompts.js";

export interface UpdateOptions {
  bump?: boolean;
  dryRun?: boolean;
}

/** Apply the patch bump (if requested) to get the spec that would be written. */
function nextSpec(spec: AgentSpec, bump: boolean): AgentSpec {
  return bump ? { ...spec, version: bumpPatch(spec.version) } : spec;
}

/** Re-apply a stored spec to all targets, optionally bumping its patch version. */
async function reapply(spec: AgentSpec, bump: boolean): Promise<number> {
  const written = await installSpec(nextSpec(spec, bump), new Date().toISOString());
  return written.length;
}

/** Update one agent by name, or all managed agents when name is omitted. */
export async function runUpdate(name?: string, opts: UpdateOptions = {}): Promise<void> {
  p.intro(pc.bgYellow(pc.black(" perezdev update ")));
  const bump = opts.bump === true;

  if (name) {
    const spec = await getAgentSpec(name);
    if (!spec) {
      p.cancel(`No managed agent named '${name}'. Run ${pc.cyan("perezdev list")}.`);
      process.exit(1);
    }
    if (opts.dryRun) {
      p.note(renderDiff(await planSpec(nextSpec(spec, bump))), `Would re-apply '${name}'`);
      p.outro(pc.dim("dry run — nothing written."));
      return;
    }
    const n = await reapply(spec, bump);
    p.outro(`${pc.green("✓")} Re-applied '${name}' (${n} file(s))${bump ? ", version bumped" : ""}.`);
    return;
  }

  const entries = await listEntries();
  if (entries.length === 0) {
    p.outro("Nothing to update — no managed agents recorded.");
    return;
  }
  if (opts.dryRun) {
    for (const e of entries) {
      p.note(renderDiff(await planSpec(nextSpec(e.spec, bump))), `Would re-apply '${e.spec.name}'`);
    }
    p.outro(pc.dim(`dry run — ${entries.length} agent(s), nothing written.`));
    return;
  }
  let total = 0;
  for (const e of entries) total += await reapply(e.spec, bump);
  p.outro(`${pc.green("✓")} Updated ${entries.length} agent(s), ${total} file(s).`);
}
