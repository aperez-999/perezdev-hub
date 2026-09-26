import pc from "picocolors";
import { hasAnthropicKey } from "../core/config.js";
import { generateSpec, type GenerateInput } from "../core/generate.js";
import { planChanges, toStandalone } from "../core/install.js";
import { readLock } from "../core/lockfile.js";
import { detectCommands } from "../core/commands.js";
import { recommend } from "../core/recommend.js";
import { scanProject } from "../core/scan.js";
import { join } from "node:path";
import { resolveScope, type ScopeOptions } from "../core/scope.js";
import { hasDoctorWorkflow } from "../core/readiness.js";
import { atomicWrite, exists } from "../util/fs-safe.js";
import { printNextSteps } from "../ui/next-steps.js";
import { WORKFLOW_PATH, workflowFor } from "./ci.js";
import { resolveTargets } from "../core/targets.js";
import { toolName } from "../adapters/tools.js";
import { synthesizeInstructions } from "../llm/synthesize.js";
import { confirmAndApply, type ApplyOptions } from "../ui/apply.js";
import { p, guardCancel, intro, isInteractive } from "../ui/prompts.js";

const AGENTS_MD_PICK = "ctx:agents-md";
const CI_PICK = "ctx:ci";

export interface InitOptions extends ScopeOptions, ApplyOptions {
  target?: string;
}

/**
 * Set up agents for a repo: scan the stack, suggest skills and MCP servers that
 * fit it, and write them for every tool in use. With `--yes`, takes every
 * suggested skill plus the MCP servers that need no credentials.
 */
export async function runInit(opts: InitOptions = {}): Promise<void> {
  const scope = await resolveScope(opts);
  intro("init", scope);

  const [scan, resolved, lock] = await Promise.all([
    scanProject(scope.kind === "project" ? scope.root : process.cwd()),
    resolveTargets(scope, opts.target),
    readLock(scope),
  ]);
  const agents = Object.values(lock.agents);
  const servers = Object.values(lock.mcpServers);
  const targets = resolved.targets;
  p.log.info(`${pc.dim("stack")}  ${scan.signals.join(" · ") || "nothing recognized"}`);
  p.log.info(`${pc.dim("tools")}  ${targets.map(toolName).join(", ")}${resolved.source === "all" ? pc.dim("  (none detected — writing for all)") : ""}`);

  const recs = recommend(scan, new Set(agents.map((e) => e.spec.name)), new Set(servers.map((m) => m.id)));
  // Offer the AGENTS.md Commands section when the repo has commands and it isn't on yet.
  const offerAgentsMd = scope.kind === "project" && !lock.agentsMd && (await detectCommands(scope.root)).length > 0;
  const offerCi = scope.kind === "project" && !(await hasDoctorWorkflow(scope.root)) && !(await exists(join(scope.root, WORKFLOW_PATH)));
  if (recs.agents.length === 0 && recs.mcp.length === 0 && !offerAgentsMd) {
    await printNextSteps(scope, lock, { full: true });
    p.outro(`Nothing new to suggest. ${pc.dim("More: perezdev presets · perezdev add anthropics/skills --list · perezdev mcp")}`);
    return;
  }

  const defaults = [
    ...(offerAgentsMd ? [AGENTS_MD_PICK] : []),
    ...(offerCi ? [CI_PICK] : []),
    ...recs.agents.map((a) => `a:${a.name}`),
    ...recs.mcp.filter((m) => !m.server.needs).map((m) => `m:${m.server.id}`),
  ];
  let picks: string[];
  if (opts.yes || !isInteractive()) {
    picks = defaults;
  } else {
    picks = guardCancel(
      await p.multiselect({
        message: "Install",
        options: [
          ...(offerAgentsMd
            ? [{ value: AGENTS_MD_PICK, label: `AGENTS.md ${pc.dim("(Commands section)")}`, hint: "build/test/lint commands every agent reads" }]
            : []),
          ...(offerCi ? [{ value: CI_PICK, label: `CI check ${pc.dim(`(${WORKFLOW_PATH})`)}`, hint: "fail pull requests when these files drift" }] : []),
          ...recs.agents.map((a) => ({ value: `a:${a.name}`, label: a.name, hint: a.reason })),
          ...recs.mcp.map((m) => ({
            value: `m:${m.server.id}`,
            label: `${m.server.id} ${pc.dim("(MCP)")}`,
            hint: m.server.needs ? `${m.reason} · needs ${m.server.needs.join(", ")}` : m.reason,
          })),
        ],
        initialValues: defaults,
        required: false,
      }),
    ) as string[];
  }
  if (picks.length === 0) {
    p.outro("Nothing selected.");
    return;
  }

  const useLlm = hasAnthropicKey();
  const spin = useLlm ? p.spinner() : null;
  spin?.start("Writing instructions with Claude…");
  const specs = [];
  for (const proposal of recs.agents.filter((a) => picks.includes(`a:${a.name}`))) {
    const { name, role, description, allowedTools } = proposal;
    const input: GenerateInput = { name, role, description, allowedTools, behaviors: [], mcpDependencies: [], targets };
    specs.push(generateSpec(input, useLlm ? ((await synthesizeInstructions(input)) ?? undefined) : undefined));
  }
  spin?.stop("Instructions written.");
  const mcp = recs.mcp.filter((m) => picks.includes(`m:${m.server.id}`)).map((m) => toStandalone(m.server, targets));

  const plan = await planChanges(scope, { agents: specs, mcp, ...(picks.includes(AGENTS_MD_PICK) ? { agentsMd: true } : {}) });
  await confirmAndApply(plan, "Write these files?", opts);
  if (opts.dryRun) {
    if (picks.includes(CI_PICK)) p.log.info(pc.dim(`would also create ${WORKFLOW_PATH}`));
    return;
  }
  if (picks.includes(CI_PICK)) {
    await atomicWrite(join(scope.root, WORKFLOW_PATH), await workflowFor(scope.root));
    p.log.step(`created ${WORKFLOW_PATH}`);
  }

  await printNextSteps(scope, plan.next, { full: true });
  p.outro(`${pc.green("✓")} Set up. ${pc.dim("Run perezdev any time to see status; perezdev doctor checks for drift.")}`);
}
