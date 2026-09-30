import pc from "picocolors";
import { detectCommands } from "../core/commands.js";
import { planChanges } from "../core/install.js";
import { resolveScope, type ScopeOptions } from "../core/scope.js";
import { confirmAndApply, type ApplyOptions } from "../ui/apply.js";
import { p, intro } from "../ui/prompts.js";

export interface AgentsMdOptions extends ScopeOptions, ApplyOptions {
  /** Remove the section and stop managing it. */
  off?: boolean;
}

/**
 * Keep a generated Commands section in AGENTS.md — the file Codex, Cursor,
 * Copilot, Windsurf, Cline, and Roo all read — and import it from CLAUDE.md for
 * Claude Code. The rest of both files stays yours.
 */
export async function runAgentsMd(opts: AgentsMdOptions = {}): Promise<void> {
  const scope = await resolveScope(opts);
  if (scope.kind !== "project") {
    console.error(pc.red("AGENTS.md is per repository — run this inside one."));
    process.exit(1);
  }
  intro("agents-md", scope);

  if (!opts.off) {
    const commands = await detectCommands(scope.root);
    if (commands.length === 0) {
      p.cancel("No build or test commands found (looked at package.json, pyproject.toml, requirements.txt, go.mod, Cargo.toml, Makefile).");
      process.exit(1);
    }
  }
  const plan = await planChanges(scope, { agentsMd: !opts.off });
  const wrote = await confirmAndApply(plan, opts.off ? "Remove perezdev's section?" : "Write these sections?", opts);
  if (opts.dryRun) return;
  p.outro(
    opts.off
      ? `${pc.green("✓")} AGENTS.md section removed.`
      : `${pc.green("✓")} ${wrote ? "AGENTS.md is set up" : "AGENTS.md is already current"}. ${pc.dim("perezdev sync refreshes it; doctor flags it when it goes stale.")}`,
  );
}
