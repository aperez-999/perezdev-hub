import pc from "picocolors";
import { slugSchema, TOOL_IDS, type McpDependency, type ToolId } from "../core/agent-spec.js";
import { slugify } from "../core/slug.js";
import { generateSpec, type GenerateInput } from "../core/generate.js";
import { getPreset } from "../core/presets.js";
import { hasAnthropicKey } from "../core/config.js";
import { installSpec, planSpec } from "../core/install.js";
import { resolveTargets, type ResolvedTargets } from "../core/targets.js";
import { synthesizeInstructions } from "../llm/synthesize.js";
import { p, guardCancel, renderDiff } from "../ui/prompts.js";

/** Flags accepted by `perezdev create` for quick / non-interactive use. */
export interface CreateOptions {
  name?: string;
  purpose?: string;
  role?: string;
  target?: string; // comma-separated tool ids
  preset?: string;
  advanced?: boolean;
  yes?: boolean;
  dryRun?: boolean;
}

const isTty = Boolean(process.stdout.isTTY);

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

  const resolved = await resolveTargets(opts.target);
  const input = await buildInput(opts, resolved);

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

  if (opts.dryRun) {
    p.note(renderDiff(await planSpec(spec)), "Files to write");
    p.outro(pc.dim(`dry run — nothing written. Drop --dry-run to install '${spec.name}'.`));
    return;
  }

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
async function buildInput(opts: CreateOptions, resolved: ResolvedTargets): Promise<GenerateInput> {
  const defaultTargets = resolved.targets;
  // A flag or an .perezdevrc default already picked targets — don't ask again.
  const targetsChosen = resolved.source === "flag" || resolved.source === "rc";

  // 1. Preset — fully formed; only targets may come from a flag/rc.
  if (opts.preset) {
    const preset = getPreset(opts.preset);
    if (!preset) {
      p.cancel(`Unknown preset '${opts.preset}'. Run ${pc.cyan("perezdev presets")} to list them.`);
      process.exit(1);
    }
    return { ...preset.input, targets: defaultTargets };
  }

  // 2. Flags supply name + purpose → quick, no prompts (defaults for the rest).
  // Purpose-only uses the same stopword slug as the Skills page.
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

  // Skip the target prompt entirely when a flag or rc default already chose.
  const targets = targetsChosen
    ? defaultTargets
    : (guardCancel(
        await p.multiselect({
          message: "Install to",
          options: defaultTargets.length
            ? buildTargetOptions(defaultTargets)
            : buildTargetOptions([...TOOL_IDS]),
          initialValues: defaultTargets,
          required: true,
        }),
      ) as ToolId[]);

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
