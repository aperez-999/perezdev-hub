import pc from "picocolors";
import { getAgentSpec, getMcpEntry } from "../core/lockfile.js";
import { redactEnv } from "../core/mcp-allow.js";
import { displayPath, resolveScope, type ScopeOptions } from "../core/scope.js";
import { agentFiles, mcpFiles } from "../adapters/plan.js";
import { toolName } from "../adapters/tools.js";
import { exists } from "../util/fs-safe.js";

export interface ShowOptions extends ScopeOptions {
  json?: boolean;
}

const line = (k: string, v: string) => `  ${pc.dim(k.padEnd(10))} ${v}`;

/** Print a managed agent's spec + file locations, or a standalone MCP server. */
export async function runShow(name: string, opts: ShowOptions = {}): Promise<void> {
  const scope = await resolveScope(opts);
  const spec = await getAgentSpec(scope, name);
  if (spec) {
    const files = await Promise.all(
      agentFiles(spec, scope).map(async (f) => ({ path: f.path, tools: f.tools, present: await exists(f.path) })),
    );
    if (opts.json) {
      const mcpDependencies = spec.mcpDependencies.map((m) => ({ ...m, env: redactEnv(m.env) }));
      console.log(JSON.stringify({ kind: "agent", ...spec, mcpDependencies, files }, null, 2));
      return;
    }

    console.log();
    console.log(pc.bold(pc.cyan(`  ${spec.name}`)) + pc.dim(`  v${spec.version}`));
    console.log(line("role", spec.role));
    console.log(line("when", spec.description));
    console.log(line("tools", spec.targets.map(toolName).join(", ")));
    if (spec.allowedTools.length) console.log(line("allowed", spec.allowedTools.join(", ")));
    if (spec.mcpDependencies.length) console.log(line("mcp", spec.mcpDependencies.map((m) => m.name).join(", ")));

    console.log("\n  " + pc.bold("Files"));
    for (const f of files) {
      const mark = f.present ? pc.green("●") : pc.red("○");
      console.log(`  ${mark} ${displayPath(scope, f.path)}  ${pc.dim(f.tools.map(toolName).join(", "))}`);
    }
    console.log("\n  " + pc.bold("Instructions"));
    console.log(spec.instructions.split("\n").map((l) => pc.dim("  │ ") + l).join("\n"));
    console.log();
    return;
  }

  const mcp = await getMcpEntry(scope, name);
  if (mcp) {
    if (opts.json) {
      const dependency = { ...mcp.dependency, env: redactEnv(mcp.dependency.env) };
      console.log(JSON.stringify({ kind: "mcp", ...mcp, dependency }, null, 2));
      return;
    }
    console.log();
    console.log(pc.bold(pc.cyan(`  ${mcp.id}`)) + pc.dim("  MCP server"));
    console.log(line("name", mcp.name));
    console.log(line("command", `${mcp.dependency.command} ${mcp.dependency.args.join(" ")}`.trim()));
    console.log(line("tools", mcp.targets.map(toolName).join(", ")));
    console.log(line("config", mcpFiles(mcp.targets, scope).map((f) => displayPath(scope, f.path)).join(", ")));
    console.log();
    return;
  }

  console.error(pc.red(`No agent or MCP server named '${name}' here. Run perezdev list${opts.global ? " -g" : ""}.`));
  process.exitCode = 1;
}
