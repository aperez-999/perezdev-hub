import pc from "picocolors";
import { detectAll } from "../adapters/registry.js";
import { slugSchema, TOOL_IDS, type McpDependency, type ToolId } from "../core/agent-spec.js";
import { generateSpec, type GenerateInput } from "../core/generate.js";
import { getPreset } from "../core/presets.js";
import { hasAnthropicKey } from "../core/config.js";
import { installSpec, planSpec } from "../core/install.js";
import { synthesizeInstructions } from "../llm/synthesize.js";
import { p, guardCancel, renderDiff } from "../ui/prompts.js";

/** Flags accepted by `inspo create` for quick / non-interactive use. */
export interface CreateOptions {
  name?: string;
  purpose?: string;
  role?: string;
  target?: string; // comma-separated tool ids
  preset?: string;
  advanced?: boolean;
  yes?: boolean;
}

const isTty = Boolean(process.stdout.isTTY);

/** Parse a comma list of tool ids, keeping only valid ones. Empty → undefined. */
function resolveTargets(csv?: string): ToolId[] | undefined {
  if (!csv) return undefined;
  const ids = csv
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ToolId => (TOOL_IDS as readonly string[]).includes(s));
  return ids.length > 0 ? ids : undefined;
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

/** Q&A wizard (or flag/preset-driven): build an agent and install it globally. */
export async function runCreate(opts: CreateOptions = {}): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" perezdev create ")));

  const detected = await detectAll();
  const installedIds = detected.filter((d) => d.detection.installed).map((d) => d.adapter.id);
  const defaultTargets: ToolId[] = installedIds.length > 0 ? installedIds : [...TOOL_IDS];

  const input = await buildInput(opts, defaultTargets);

  // LLM-enhance the body when a key is present; else deterministic template.
  let override: string | undefined;
  if (hasAnthropicKey()) {
    const spin = p.spinner();
    spin.start("Synthesizing instructions with Claude…");
    const text = await synthesizeInstructions(input);
    spin.stop(text ? "Instructions synthesized." : "Used template (LLM unavailable).");
    override = text ?? undefined;
  }

  const spec = generateSpec(input, override);

  const auto = opts.yes === true || !isTty;
  if (!auto) {
    p.note(renderDiff(await planSpec(spec)), "Files to write");
    const ok = guardCancel(
      await p.confirm({ message: `Install '${spec.name}' to ${spec.targets.join(", ")}?` }),
    );
    if (!ok) {
      p.cancel("Aborted. Nothing written.");
      process.exit(0);
    }
  }

  const written = await installSpec(spec, new Date().toISOString());
  const paths = written.map((f) => `  ${pc.dim("→")} ${f.path}`).join("\n");
  p.note(paths, "Wrote");
  p.outro(
    `${pc.green("✓")} Installed ${pc.bold(spec.name)} → ${spec.targets.join(", ")}.  ` +
      `${pc.dim(`perezdev list · perezdev show ${spec.name}`)}`,
  );
}

/** Resolve a GenerateInput from preset, flags, and/or interactive prompts. */
async function buildInput(opts: CreateOptions, defaultTargets: ToolId[]): Promise<GenerateInput> {
  // 1. Preset — fully formed; only targets may come from a flag.
  if (opts.preset) {
    const preset = getPreset(opts.preset);
    if (!preset) {
      p.cancel(`Unknown preset '${opts.preset}'. Run ${pc.cyan("perezdev presets")} to list them.`);
      process.exit(1);
    }
    return { ...preset.input, targets: resolveTargets(opts.target) ?? defaultTargets };
  }

  // 2. Flags supply name + purpose → quick, no prompts (defaults for the rest).
  if (opts.name && opts.purpose) {
    const r = slugSchema.safeParse(opts.name);
    if (!r.success) {
      p.cancel(`Invalid --name: ${r.error.issues[0]?.message}`);
      process.exit(1);
    }
    return {
      name: opts.name,
      role: opts.role ?? deriveRole(opts.name),
      description: opts.purpose,
      behaviors: [],
      allowedTools: [],
      mcpDependencies: [],
      targets: resolveTargets(opts.target) ?? defaultTargets,
    };
  }

  // 3. Interactive — minimal by default: name + purpose + targets.
  const name =
    opts.name ??
    guardCancel(
      await p.text({
        message: "Agent name",
        placeholder: "code-reviewer",
        validate: (v) => slugSchema.safeParse(v).error?.issues[0]?.message,
      }),
    );

  const purpose =
    opts.purpose ??
    guardCancel(
      await p.text({
        message: "What should it do?",
        placeholder: "review my code for bugs and security issues",
        validate: (v) => (v.trim().length >= 8 ? undefined : "Give a short description (min 8 chars)."),
      }),
    );

  const targets = guardCancel(
    await p.multiselect({
      message: "Install to",
      options: defaultTargets.length
        ? buildTargetOptions(defaultTargets)
        : buildTargetOptions([...TOOL_IDS]),
      initialValues: defaultTargets,
      required: true,
    }),
  ) as ToolId[];

  // Optional advanced step — off unless asked, so the common path stays fast.
  let behaviors: string[] = [];
  let allowedTools: string[] = [];
  let mcpDependencies: McpDependency[] = [];
  const wantAdvanced =
    opts.advanced ||
    guardCancel(
      await p.confirm({ message: "Customize behaviors / tools / MCP?", initialValue: false }),
    );
  if (wantAdvanced) {
    behaviors = splitItems(
      guardCancel(await p.text({ message: "Key behaviors (comma/newline, optional)", placeholder: "" })),
    );
    allowedTools = splitItems(
      guardCancel(await p.text({ message: "Allowed tools (comma, optional)", placeholder: "Read, Grep" })),
    );
    mcpDependencies = await collectMcpDeps();
  }

  return {
    name,
    role: opts.role ?? deriveRole(name),
    description: purpose,
    behaviors,
    allowedTools,
    mcpDependencies,
    targets,
  };
}

function buildTargetOptions(ids: ToolId[]) {
  const labels: Record<ToolId, string> = {
    "claude-code": "Claude Code",
    cursor: "Cursor",
    copilot: "GitHub Copilot",
    codex: "Codex",
    cline: "Cline",
    windsurf: "Windsurf",
    roo: "Roo Code",
  };
  return ids.map((id) => ({ value: id, label: labels[id] }));
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
    const command = guardCancel(
      await p.text({ message: "Launch command", initialValue: "npx" }),
    );
    const argsRaw = guardCancel(
      await p.text({ message: "Arguments (comma)", placeholder: "-y, @modelcontextprotocol/server-filesystem" }),
    );
    deps.push({ name, command, args: splitItems(argsRaw), env: {} });
    add = guardCancel(await p.confirm({ message: "Add another?", initialValue: false }));
  }
  return deps;
}
