import pc from "picocolors";
import { listEntries, getAgentSpec } from "../core/lockfile.js";
import { installSpec, bumpPatch } from "../core/install.js";
import type { AgentSpec } from "../core/agent-spec.js";
import { p } from "../ui/prompts.js";

export interface UpdateOptions {
  bump?: boolean;
}

/** Re-apply a stored spec to all targets, optionally bumping its patch version. */
async function reapply(spec: AgentSpec, bump: boolean): Promise<number> {
  const next = bump ? { ...spec, version: bumpPatch(spec.version) } : spec;
  const written = await installSpec(next, new Date().toISOString());
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
    const n = await reapply(spec, bump);
    p.outro(`${pc.green("✓")} Re-applied '${name}' (${n} file(s))${bump ? ", version bumped" : ""}.`);
    return;
  }

  const entries = await listEntries();
  if (entries.length === 0) {
    p.outro("Nothing to update — no managed agents recorded.");
    return;
  }
  let total = 0;
  for (const e of entries) total += await reapply(e.spec, bump);
  p.outro(`${pc.green("✓")} Updated ${entries.length} agent(s), ${total} file(s).`);
}
