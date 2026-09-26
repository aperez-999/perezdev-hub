import pc from "picocolors";
import { listEntries, listMcpEntries } from "../core/lockfile.js";
import { resolveScope, scopeLabel, type ScopeOptions } from "../core/scope.js";
import { toolName } from "../adapters/tools.js";
import { table } from "../ui/table.js";

interface ListOptions extends ScopeOptions {
  json?: boolean;
}

/** List the agents and MCP servers recorded in this scope's lockfile. */
export async function runList(opts: ListOptions = {}): Promise<void> {
  const scope = await resolveScope(opts);
  const agents = (await listEntries(scope)).map((e) => e.spec);
  const mcp = await listMcpEntries(scope);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          scope: scope.kind,
          root: scope.root,
          agents: agents.map((s) => ({ name: s.name, version: s.version, description: s.description, targets: s.targets })),
          mcp: mcp.map((m) => ({ id: m.id, name: m.name, targets: m.targets })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(pc.dim(`\n  ${scopeLabel(scope)}\n`));
  if (agents.length === 0 && mcp.length === 0) {
    console.log(pc.dim("  Nothing installed. Try ") + pc.cyan("perezdev init") + pc.dim(" or ") + pc.cyan("perezdev presets") + "\n");
    return;
  }
  if (agents.length > 0) {
    const rows = agents.map((s) => [pc.cyan(s.name), s.version, s.targets.map(toolName).join(", ")]);
    console.log(indent(table(["AGENT", "VERSION", "TOOLS"], rows)) + "\n");
  }
  if (mcp.length > 0) {
    const rows = mcp.map((m) => [pc.cyan(m.id), m.targets.map(toolName).join(", ")]);
    console.log(indent(table(["MCP SERVER", "TOOLS"], rows)) + "\n");
  }
}

const indent = (s: string) => s.split("\n").map((l) => `  ${l}`).join("\n");
