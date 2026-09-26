import pc from "picocolors";
import { getAgentSpec, getMcpEntry } from "../core/lockfile.js";
import { planChanges } from "../core/install.js";
import { resolveScope, type ScopeOptions } from "../core/scope.js";
import { confirmAndApply, type ApplyOptions } from "../ui/apply.js";
import { p, intro } from "../ui/prompts.js";

export interface RemoveOptions extends ScopeOptions, Pick<ApplyOptions, "yes" | "dryRun"> {}

/** Remove a managed agent (or standalone MCP server) from every tool and the lockfile. */
export async function runRemove(name: string, opts: RemoveOptions = {}): Promise<void> {
  const scope = await resolveScope(opts);
  intro("remove", scope);

  const isAgent = Boolean(await getAgentSpec(scope, name));
  if (!isAgent && !(await getMcpEntry(scope, name))) {
    p.cancel(`No agent or MCP server named '${name}'. Run ${pc.cyan("perezdev list")}.`);
    process.exit(1);
  }

  const plan = await planChanges(scope, isAgent ? { removeAgents: [name] } : { removeMcp: [name] });
  await confirmAndApply(plan, `Remove '${name}'?`, opts);
  if (opts.dryRun) return;
  p.outro(`${pc.green("✓")} Removed '${name}'.`);
}
