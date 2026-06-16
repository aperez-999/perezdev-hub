import pc from "picocolors";
import { STACKS, getStack } from "../registry/index.js";

const STACK_IDS = STACKS.map((s) => s.id);
import { TOOL_IDS, type ToolId } from "../core/agent-spec.js";
import { detectAll } from "../adapters/registry.js";
import { installStack, planStack } from "../core/stack.js";
import { p, guardCancel, renderDiff } from "../ui/prompts.js";

const isTty = Boolean(process.stdout.isTTY);

export interface StackOptions {
  target?: string;
  yes?: boolean;
}

function resolveTargets(csv?: string): ToolId[] | undefined {
  if (!csv) return undefined;
  const ids = csv
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ToolId => (TOOL_IDS as readonly string[]).includes(s));
  return ids.length > 0 ? ids : undefined;
}

/** Install a stack: skill presets + MCP servers across detected tools. */
export async function runStackInstall(id: string, opts: StackOptions = {}): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" perezdev stack ")));

  const stack = getStack(id);
  if (!stack) {
    p.cancel(`Unknown stack '${id}'. Known stacks: ${STACK_IDS.join(", ")}.`);
    process.exit(1);
  }

  const detected = await detectAll();
  const installedIds = detected.filter((d) => d.detection.installed).map((d) => d.adapter.id);
  const targets = resolveTargets(opts.target) ?? (installedIds.length > 0 ? installedIds : [...TOOL_IDS]);

  const auto = opts.yes === true || !isTty;
  if (!auto) {
    p.note(renderDiff(await planStack(stack, targets)), `Stack: ${stack.id}`);
    const ok = guardCancel(
      await p.confirm({
        message: `Install stack '${stack.id}' (${stack.skillPresets.length} skills, ${stack.mcpServers.length} MCP) to ${targets.join(", ")}?`,
      }),
    );
    if (!ok) {
      p.cancel("Aborted.");
      process.exit(0);
    }
  }

  const result = await installStack(id, targets, new Date().toISOString());
  p.outro(
    `${pc.green("✓")} Installed stack ${pc.bold(stack.id)} — ` +
      `${result.agents.length} skill(s), ${result.mcpServers.length} MCP server(s) → ${targets.join(", ")}.`,
  );
}
