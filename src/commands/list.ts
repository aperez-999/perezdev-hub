import pc from "picocolors";
import { allAdapters } from "../adapters/registry.js";
import type { ManagedItem } from "../adapters/types.js";
import { renderManagedTable } from "../ui/table.js";
import { listMcpEntries } from "../core/lockfile.js";

interface ListOptions {
  json?: boolean;
}

/** List managed agents (across tools) and standalone MCP servers. */
export async function runList(opts: ListOptions = {}): Promise<void> {
  const items: ManagedItem[] = [];
  for (const adapter of allAdapters()) {
    items.push(...(await adapter.list()));
  }
  items.sort((a, b) => a.name.localeCompare(b.name) || a.tool.localeCompare(b.tool));
  const mcp = await listMcpEntries();

  if (opts.json) {
    console.log(JSON.stringify({ agents: items, mcp }, null, 2));
    return;
  }

  const names = new Set(items.map((i) => i.name));
  console.log(
    pc.bold("\n  PerezDev Hub — managed agents") +
      pc.dim(`  (${names.size} agent(s), ${items.length} install(s))\n`),
  );

  if (items.length === 0) {
    console.log(pc.dim("  No agents yet. ") + pc.cyan("perezdev create") + pc.dim(" · ") + pc.cyan("perezdev stack <id>"));
  } else {
    console.log(
      renderManagedTable(items)
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n"),
    );
  }

  if (mcp.length > 0) {
    console.log(pc.bold(`\n  MCP servers`) + pc.dim(`  (${mcp.length})`));
    for (const m of mcp) {
      console.log(`  ${pc.cyan(m.id.padEnd(14))} ${pc.dim(m.targets.join(", "))}`);
    }
  }

  console.log(pc.dim(`\n  perezdev show <name> · perezdev doctor\n`));
}
