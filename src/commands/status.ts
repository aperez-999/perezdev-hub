import pc from "picocolors";
import { detectedTools, toolName } from "../adapters/tools.js";
import { diagnose, doctorAdvice, summarize } from "../core/doctor.js";
import { readLock } from "../core/lockfile.js";
import { resolveScope, scopeLabel, type ScopeOptions } from "../core/scope.js";
import { resolveTargets } from "../core/targets.js";
import { version } from "../core/version.js";
import { statusHints } from "../ui/next-steps.js";

const row = (k: string, v: string) => `  ${pc.dim(k.padEnd(8))} ${v}`;

/** `perezdev` with no command: where you are, what's installed, and whether it has drifted. */
export async function runStatus(opts: ScopeOptions = {}): Promise<void> {
  const scope = await resolveScope(opts);
  const [lock, resolved, items] = await Promise.all([readLock(scope), resolveTargets(scope), diagnose(scope)]);
  const agents = Object.keys(lock.agents);
  const servers = Object.keys(lock.mcpServers);
  const report = summarize(items);
  const source: Record<typeof resolved.source, string> = {
    flag: "",
    rc: "from ~/.perezdevrc",
    detected: scope.kind === "project" && !(await detectedTools(scope)).length ? "installed on this machine" : "detected",
    all: "none detected — all tools",
  };

  console.log(`\n  ${pc.bold("perezdev")} ${pc.dim(`v${version} · ${scopeLabel(scope)}`)}\n`);
  console.log(row("tools", `${resolved.targets.map(toolName).join(", ")} ${pc.dim(`(${source[resolved.source]})`)}`));
  console.log(row("agents", agents.length ? agents.join(", ") : pc.dim("none")));
  console.log(row("mcp", servers.length ? servers.join(", ") : pc.dim("none")));
  if (scope.kind === "project") console.log(row("context", lock.agentsMd ? "AGENTS.md commands (managed)" : pc.dim("off — perezdev agents-md")));
  if (items.length > 0) {
    console.log(row("health", `${report.ok ? pc.green("✓") : pc.red("✗")} ${doctorAdvice(items)}`));
  }

  if (agents.length + servers.length === 0 && !lock.agentsMd) {
    const here = scope.kind === "project" ? "this repo" : "every project (global)";
    console.log(`\n  ${pc.bold("Get started")}`);
    console.log(`  ${pc.cyan("perezdev init".padEnd(38))} suggest skills, MCP servers, and AGENTS.md for ${here}`);
    console.log(`  ${pc.cyan("perezdev add anthropics/skills --list".padEnd(38))} browse published skills to install`);
    console.log(`  ${pc.cyan("perezdev create".padEnd(38))} describe an agent and generate it`);
    console.log(`  ${pc.cyan("perezdev --help".padEnd(38))} everything else\n`);
    return;
  }

  const hints = await statusHints(scope, lock);
  if (hints.length > 0) {
    console.log(`\n  ${pc.bold("Next")}`);
    for (const h of hints) console.log(`  ${h}`);
  }
  console.log(`\n  ${pc.dim("perezdev list · perezdev doctor · perezdev --help")}\n`);
}
