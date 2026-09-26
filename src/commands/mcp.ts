import pc from "picocolors";
import { MCP_SERVERS, getMcpServer } from "../registry/index.js";
import { listMcpEntries } from "../core/lockfile.js";
import { planChanges, toStandalone } from "../core/install.js";
import { resolveScope, type ScopeOptions } from "../core/scope.js";
import { resolveTargets } from "../core/targets.js";
import { printNextSteps } from "../ui/next-steps.js";
import { confirmAndApply, type ApplyOptions } from "../ui/apply.js";
import { p, intro } from "../ui/prompts.js";
import { table } from "../ui/table.js";

export interface McpOptions extends ScopeOptions, ApplyOptions {
  target?: string;
}

/** `perezdev mcp` lists the catalog; `perezdev mcp <id…>` installs servers into the scope's tools. */
export async function runMcp(ids: string[], opts: McpOptions = {}): Promise<void> {
  const scope = await resolveScope(opts);

  if (ids.length === 0) {
    const installed = new Set((await listMcpEntries(scope)).map((m) => m.id));
    const rows = MCP_SERVERS.map((s) => [
      installed.has(s.id) ? pc.green(s.id) : pc.cyan(s.id),
      s.description + (s.needs ? pc.dim(`  needs ${s.needs.join(", ")}`) : ""),
    ]);
    console.log("\n" + table(["SERVER", "WHAT IT DOES"], rows).split("\n").map((l) => `  ${l}`).join("\n"));
    console.log(pc.dim(`\n  perezdev mcp <id…> to install${installed.size ? " · green = installed here" : ""}\n`));
    return;
  }

  const unknown = ids.filter((id) => !getMcpServer(id));
  if (unknown.length > 0) {
    console.error(pc.red(`Unknown MCP server(s): ${unknown.join(", ")}. Run perezdev mcp to see the catalog.`));
    process.exit(1);
  }
  intro("mcp", scope);
  const { targets } = await resolveTargets(scope, opts.target);
  const servers = ids.map((id) => getMcpServer(id)!);
  const plan = await planChanges(scope, { mcp: servers.map((s) => toStandalone(s, targets)) });
  const wrote = await confirmAndApply(plan, `Install ${ids.join(", ")}?`, opts);
  if (opts.dryRun) return;
  if (wrote) await printNextSteps(scope, plan.next);

  p.outro(`${pc.green("✓")} Installed ${ids.join(", ")}.`);
}
