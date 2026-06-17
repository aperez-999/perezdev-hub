import pc from "picocolors";
import { getAgentSpec, getMcpEntry } from "../core/lockfile.js";
import { getAdapter } from "../adapters/registry.js";

export interface ShowOptions {
  json?: boolean;
}

/** Print a managed agent's spec + file locations, or a standalone MCP server. */
export async function runShow(name: string, opts: ShowOptions = {}): Promise<void> {
  const spec = await getAgentSpec(name);
  if (spec) {
    const files = await Promise.all(
      spec.targets.map(async (t) => {
        const found = (await getAdapter(t).list()).find((i) => i.name === spec.name);
        return { tool: t, path: found?.path ?? null, present: Boolean(found) };
      }),
    );

    if (opts.json) {
      console.log(JSON.stringify({ kind: "agent", ...spec, files }, null, 2));
      return;
    }

    const line = (k: string, v: string) => `  ${pc.dim(k.padEnd(12))} ${v}`;
    console.log();
    console.log(pc.bold(pc.cyan(`  ${spec.name}`)) + pc.dim(`  v${spec.version}`));
    console.log(line("role", spec.role));
    console.log(line("when", spec.description));
    console.log(line("targets", spec.targets.join(", ")));
    if (spec.allowedTools.length) console.log(line("tools", spec.allowedTools.join(", ")));
    if (spec.mcpDependencies.length) console.log(line("mcp", spec.mcpDependencies.map((m) => m.name).join(", ")));

    console.log("\n  " + pc.bold("Files"));
    for (const f of files) {
      const mark = f.present ? pc.green("●") : pc.red("○ missing");
      console.log(`  ${mark} ${pc.dim(f.tool)}  ${f.path ?? ""}`);
    }

    console.log("\n  " + pc.bold("Instructions"));
    console.log(
      spec.instructions
        .split("\n")
        .map((l) => pc.dim("  │ ") + l)
        .join("\n"),
    );
    console.log();
    return;
  }

  // Not an agent — try a standalone MCP server with this id.
  const mcp = await getMcpEntry(name);
  if (mcp) {
    if (opts.json) {
      console.log(JSON.stringify({ kind: "mcp", ...mcp }, null, 2));
      return;
    }
    const line = (k: string, v: string) => `  ${pc.dim(k.padEnd(12))} ${v}`;
    console.log();
    console.log(pc.bold(pc.cyan(`  ${mcp.id}`)) + pc.dim("  (mcp server)"));
    console.log(line("name", mcp.name));
    console.log(line("command", `${mcp.dependency.command} ${mcp.dependency.args.join(" ")}`.trim()));
    console.log(line("targets", mcp.targets.join(", ")));
    console.log();
    return;
  }

  console.error(pc.red(`No managed agent or MCP server named '${name}'. Run perezdev list.`));
  process.exit(1);
}
