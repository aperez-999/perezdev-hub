import pc from "picocolors";
import { heading } from "../ui/style.js";
import { STACKS, getStack } from "../registry/index.js";
import { stackChanges } from "../core/stack.js";
import { planChanges } from "../core/install.js";
import { resolveScope, type ScopeOptions } from "../core/scope.js";
import { resolveTargets } from "../core/targets.js";
import { printNextSteps } from "../ui/next-steps.js";
import { confirmAndApply, type ApplyOptions } from "../ui/apply.js";
import { p, intro } from "../ui/prompts.js";

export interface StackOptions extends ScopeOptions, ApplyOptions {
  target?: string;
}

/** List the bundled stacks. */
export function printStacks(): void {
  console.log(`\n  ${heading("Stacks")}${pc.dim("  (perezdev stack <id>)")}\n`);
  const width = Math.max(...STACKS.map((s) => s.id.length));
  for (const s of STACKS) {
    const parts = `${s.skillPresets.length} skills, ${s.mcpServers.length} MCP`;
    console.log(`  ${pc.cyan(s.id.padEnd(width))}  ${s.summary} ${pc.dim(`(${parts})`)}`);
  }
  console.log();
}

/** Install a stack: skill presets + MCP servers in one step. */
export async function runStackInstall(id: string | undefined, opts: StackOptions = {}): Promise<void> {
  if (!id) return printStacks();
  const stack = getStack(id);
  if (!stack) {
    console.error(pc.red(`Unknown stack '${id}'. Known: ${STACKS.map((s) => s.id).join(", ")}.`));
    process.exit(1);
  }
  const scope = await resolveScope(opts);
  intro(`stack ${stack.id}`, scope);

  const { targets } = await resolveTargets(scope, opts.target);
  const plan = await planChanges(scope, stackChanges(stack, targets));
  const wrote = await confirmAndApply(plan, `Install stack '${stack.id}'?`, opts);
  if (opts.dryRun) return;
  if (wrote) await printNextSteps(scope, plan.next);
  p.outro(`${pc.green("✓")} Installed ${pc.bold(stack.id)} — ${stack.skillPresets.length} skill(s), ${stack.mcpServers.length} MCP server(s).`);
}
