import pc from "picocolors";
import { p, guardCancel, showKeyHints } from "../ui/prompts.js";
import { detectAll } from "../adapters/registry.js";
import { TOOL_IDS, type ToolId } from "../core/agent-spec.js";
import { scanProject } from "../core/scan.js";
import { recommend } from "../core/recommend.js";
import { generateSpec, type GenerateInput } from "../core/generate.js";
import { installSpec } from "../core/install.js";
import { installMcpServer } from "../core/mcp-install.js";
import { hasAnthropicKey } from "../core/config.js";
import { synthesizeInstructions } from "../llm/synthesize.js";
import { listEntries, listMcpEntries } from "../core/lockfile.js";
import { CLI_AGENTS, MCP_SERVERS, getMcpServer } from "../registry/index.js";
import { runCreate } from "./create.js";
import { runManage } from "./manage.js";

const BACK = "__back";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Run `work` but keep a spinner visible for at least `ms` so it animates. */
async function withMin<T>(ms: number, work: Promise<T>): Promise<T> {
  const [res] = await Promise.all([work, sleep(ms)]);
  return res;
}

async function targets(): Promise<ToolId[]> {
  const detected = await detectAll();
  const ids = detected.filter((d) => d.detection.installed).map((d) => d.adapter.id);
  return ids.length > 0 ? ids : [...TOOL_IDS];
}

/** Clean, breathable guided home — the default `perezdev` experience. */
export async function runHome(): Promise<void> {
  p.intro(pc.cyan(pc.bold("PerezDev Hub")));

  const spin = p.spinner();
  spin.start("scanning your project");
  const [detected, scan] = await withMin(700, Promise.all([detectAll(), scanProject()]));
  const tools = detected.filter((d) => d.detection.installed).map((d) => d.adapter.id);
  spin.stop(pc.dim(`${tools.join(" · ") || "no AI tools detected"}`));

  p.log.message(pc.dim(`this project   ${scan.signals.join(" · ") || "no project signals"}`));
  if (!hasAnthropicKey()) {
    p.log.message(pc.dim("tip: set ANTHROPIC_API_KEY for fully AI-generated agents (otherwise smart templates are used)"));
  }
  showKeyHints();

  for (;;) {
    const action = guardCancel(
      await p.select({
        message: "What do you want to do?",
        options: [
          { value: "recommend", label: "Recommend for this project", hint: "tailored, generated suggestions" },
          { value: "describe", label: "Describe an agent to build", hint: "type what you want" },
          { value: "manage", label: "Manage installed", hint: "view · update · share · remove" },
          { value: "browse", label: "Browse MCP servers & CLI agents", hint: "catalog" },
          { value: "exit", label: pc.dim("Exit") },
        ],
      }),
    ) as string;

    if (action === "recommend") await recommendFlow();
    else if (action === "describe") await runCreate({});
    else if (action === "manage") await runManage();
    else if (action === "browse") await browseFlow();
    else {
      p.outro(pc.dim("See you."));
      return;
    }
  }
}

/** Scan the project and offer generated agents + MCP servers to install. */
async function recommendFlow(): Promise<void> {
  const scan = await scanProject();
  const entries = await listEntries();
  const mcpEntries = await listMcpEntries();
  const recs = recommend(
    scan,
    new Set(entries.map((e) => e.spec.name)),
    new Set(mcpEntries.map((m) => m.id)),
  );

  if (recs.agents.length === 0 && recs.mcp.length === 0) {
    p.log.info("Nothing new to recommend — you're set up for this project.");
    return;
  }

  const options = [
    ...recs.agents.map((a, i) => ({ value: `a:${i}`, label: a.name, hint: a.reason })),
    ...recs.mcp.map((m) => ({ value: `m:${m.server.id}`, label: `${m.server.name} (mcp)`, hint: m.reason })),
  ];

  const picks = guardCancel(
    await p.multiselect({
      message: "Suggestions for this project — pick what to install",
      options,
      required: false,
    }),
  ) as string[];

  if (picks.length === 0) {
    p.log.message(pc.dim("Nothing selected."));
    return;
  }

  const tgt = await targets();
  const now = new Date().toISOString();
  const useLlm = hasAnthropicKey();
  const spin = p.spinner();
  spin.start("installing");

  let agentCount = 0;
  let mcpCount = 0;
  for (const pick of picks) {
    if (pick.startsWith("a:")) {
      const proposal = recs.agents[Number(pick.slice(2))]!;
      spin.message(useLlm ? `generating ${proposal.name}` : `building ${proposal.name}`);
      const input: GenerateInput = {
        name: proposal.name,
        role: proposal.role,
        description: proposal.description,
        behaviors: [],
        allowedTools: proposal.allowedTools,
        mcpDependencies: [],
        targets: tgt,
      };
      const override = useLlm ? (await synthesizeInstructions(input)) ?? undefined : undefined;
      await withMin(350, installSpec(generateSpec(input, override), now));
      agentCount++;
    } else {
      const server = getMcpServer(pick.slice(2));
      if (server) {
        spin.message(`installing ${server.name}`);
        await withMin(350, installMcpServer(server, tgt, now));
        mcpCount++;
      }
    }
  }
  spin.stop(`${pc.green("✓")} installed ${agentCount} agent(s) and ${mcpCount} MCP server(s) → ${tgt.join(", ")}`);
}

/** Browse the catalog: install an MCP server, or copy a CLI agent's install command. */
async function browseFlow(): Promise<void> {
  const kind = guardCancel(
    await p.select({
      message: "Browse",
      options: [
        { value: "mcp", label: "MCP servers", hint: "install into your tools" },
        { value: "cli", label: "CLI coding agents", hint: "install command + link" },
        { value: BACK, label: pc.dim("← Back") },
      ],
    }),
  ) as string;
  if (kind === BACK) return;

  if (kind === "mcp") {
    const id = guardCancel(
      await p.select({
        message: "MCP servers",
        options: [
          ...MCP_SERVERS.map((m) => ({ value: m.id, label: m.name, hint: m.description })),
          { value: BACK, label: pc.dim("← Back") },
        ],
      }),
    ) as string;
    if (id === BACK) return;
    const server = getMcpServer(id)!;
    const tgt = await targets();
    const ok = guardCancel(await p.confirm({ message: `Install ${server.name} → ${tgt.join(", ")}?` }));
    if (!ok) return;
    const res = await installMcpServer(server, tgt, new Date().toISOString());
    p.log.success(`Installed ${server.name} → ${res.installedTo.join(", ") || "(no MCP-capable tool)"}`);
    return;
  }

  const id = guardCancel(
    await p.select({
      message: "CLI coding agents",
      options: [
        ...CLI_AGENTS.map((a) => ({ value: a.id, label: a.name, hint: a.description })),
        { value: BACK, label: pc.dim("← Back") },
      ],
    }),
  ) as string;
  if (id === BACK) return;
  const agent = CLI_AGENTS.find((a) => a.id === id)!;
  p.note([agent.description, "", `repo:    ${agent.repo}`, `install: ${pc.cyan(agent.install)}`].join("\n"), agent.name);
}
