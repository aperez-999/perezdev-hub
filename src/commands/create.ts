import pc from "picocolors";
import { slugSchema, TOOL_IDS, type McpDependency, type ToolId } from "../core/agent-spec.js";
import { slugify } from "../core/slug.js";
import { generateSpec, type GenerateInput } from "../core/generate.js";
import { getPreset } from "../core/presets.js";
import { hasAnthropicKey } from "../core/config.js";
import { planChanges } from "../core/install.js";
import { resolveScope, type ScopeOptions } from "../core/scope.js";
import { resolveTargets, type ResolvedTargets } from "../core/targets.js";
import { toolName } from "../adapters/tools.js";
import { synthesizeInstructions } from "../llm/synthesize.js";
import { printNextSteps } from "../ui/next-steps.js";
import { confirmAndApply, type ApplyOptions } from "../ui/apply.js";
import { p, guardCancel, intro, isInteractive } from "../ui/prompts.js";

/** Flags accepted by `perezdev create` for quick / non-interactive use. */
export interface CreateOptions extends ScopeOptions, ApplyOptions {
  name?: string;
  purpose?: string;
  role?: string;
  target?: string; // comma-separated tool ids
  preset?: string;
  advanced?: boolean;
}

/** Derive a clean role noun-phrase from the agent name (e.g. "a code reviewer agent"). */
function deriveRole(name: string): string {
  const words = name.split("-").join(" ");
  const article = /^[aeiou]/i.test(words) ? "an" : "a";
  return `${article} ${words} agent`;
}

function splitItems(raw: string): string[] {
  return raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
}

/** Build an agent (from a preset, flags, or prompts) and install it into the scope's tools. */
export async function runCreate(opts: CreateOptions = {}): Promise<void> {
  const scope = await resolveScope(opts);
  intro("create", scope);

  const resolved = await resolveTargets(scope, opts.target);
  const input = await buildInput(opts, resolved);

  // LLM-enhance the body when a key is present (presets are already curated).
  let override: string | undefined;
  if (hasAnthropicKey() && !opts.preset) {
    const spin = p.spinner();
    spin.start("Writing instructions with Claude…");
    const text = await synthesizeInstructions(input);
    spin.stop(text ? "Instructions written." : "Claude unavailable — used the built-in template.");
    override = text ?? undefined;
  }

  const spec = generateSpec(input, override);
  const plan = await planChanges(scope, { agents: [spec] });
  const targets = plan.next.agents[spec.name]?.spec.targets ?? [];
  const wrote = await confirmAndApply(plan, `Install '${spec.name}' for ${targets.map(toolName).join(", ")}?`, opts);
  if (opts.dryRun) return;
  if (wrote) await printNextSteps(scope, plan.next);
  p.outro(
    wrote
      ? `${pc.green("✓")} ${pc.bold(spec.name)} installed. ${pc.dim(`perezdev show ${spec.name}`)}`
      : `${pc.bold(spec.name)} is already up to date.`,
  );
}

/** Resolve a GenerateInput from preset, flags, and/or interactive prompts. */
async function buildInput(opts: CreateOptions, resolved: ResolvedTargets): Promise<GenerateInput> {
  const defaultTargets = resolved.targets;
  // A flag or an rc default already picked targets — don't ask again.
  const targetsChosen = resolved.source === "flag" || resolved.source === "rc" || !isInteractive();

  if (opts.preset) {
    const preset = getPreset(opts.preset);
    if (!preset) {
      p.cancel(`Unknown preset '${opts.preset}'. Run ${pc.cyan("perezdev presets")} to list them.`);
      process.exit(1);
    }
    return { ...preset.input, targets: defaultTargets };
  }

  // Flags supply purpose (and optionally name) → no prompts.
  const named = opts.name || (opts.purpose ? slugify(opts.purpose) : undefined);
  if (named && opts.purpose) {
    const r = slugSchema.safeParse(named);
    if (!r.success) {
      p.cancel(`Invalid --name: ${r.error.issues[0]?.message}`);
      process.exit(1);
    }
    return {
      name: named,
      role: opts.role ?? deriveRole(named),
      description: opts.purpose,
      behaviors: [],
      allowedTools: [],
      mcpDependencies: [],
      targets: defaultTargets,
    };
  }

  if (!isInteractive()) {
    p.cancel(`Not a terminal — pass ${pc.cyan("--purpose")} (and optionally ${pc.cyan("--name")}) or ${pc.cyan("--preset")}.`);
    process.exit(1);
  }

  const name =
    opts.name ??
    guardCancel(
      await p.text({
        message: "Agent name",
        placeholder: "code-reviewer",
        validate: (v) => slugSchema.safeParse(v).error?.issues[0]?.message,
      }),
    );

  const purpose = guardCancel(
    await p.text({
      message: "What should it do?",
      placeholder: "review my code for bugs and security issues",
      validate: (v) => (v.trim().length >= 8 ? undefined : "Give a short description (min 8 chars)."),
    }),
  );

  const targets = targetsChosen
    ? defaultTargets
    : (guardCancel(
        await p.multiselect({
          message: "Install for",
          options: TOOL_IDS.map((id) => ({ value: id, label: toolName(id) })),
          initialValues: defaultTargets,
          required: true,
        }),
      ) as ToolId[]);

  let behaviors: string[] = [];
  let allowedTools: string[] = [];
  let mcpDependencies: McpDependency[] = [];
  if (opts.advanced) {
    behaviors = splitItems(guardCancel(await p.text({ message: "Key behaviors (comma/newline, optional)", placeholder: "" })));
    allowedTools = splitItems(guardCancel(await p.text({ message: "Allowed tools (comma, optional)", placeholder: "Read, Grep" })));
    mcpDependencies = await collectMcpDeps();
  }

  return { name, role: opts.role ?? deriveRole(name), description: purpose, behaviors, allowedTools, mcpDependencies, targets };
}

/** Optional MCP dependency loop (advanced mode only). */
async function collectMcpDeps(): Promise<McpDependency[]> {
  const deps: McpDependency[] = [];
  let add = guardCancel(await p.confirm({ message: "Add an MCP server?", initialValue: false }));
  while (add) {
    const name = guardCancel(
      await p.text({
        message: "MCP server name",
        placeholder: "filesystem",
        validate: (v) => (slugSchema.safeParse(v).success ? undefined : "Must be kebab-case."),
      }),
    );
    const command = guardCancel(await p.text({ message: "Launch command", initialValue: "npx" }));
    const argsRaw = guardCancel(
      await p.text({ message: "Arguments (comma)", placeholder: "-y, @modelcontextprotocol/server-filesystem" }),
    );
    deps.push({ name, command, args: splitItems(argsRaw), env: {} });
    add = guardCancel(await p.confirm({ message: "Add another?", initialValue: false }));
  }
  return deps;
}
