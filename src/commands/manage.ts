import pc from "picocolors";
import { p, guardCancel } from "../ui/prompts.js";
import { listEntries, listMcpEntries, getAgentSpec, removeAgentEntry } from "../core/lockfile.js";
import { getAdapter } from "../adapters/registry.js";
import { removeMcpServer } from "../core/mcp-install.js";
import { runShow } from "./show.js";
import { runUpdate } from "./update.js";
import { runExport } from "./export.js";

const BACK = "__back";
const MCP_PREFIX = "mcp:";

/**
 * Interactive management: pick an agent, then an action. No names or command
 * flags to memorize — everything is selectable. Returns to the picker after
 * each action so it feels like a small app.
 */
export async function runManage(): Promise<void> {
  for (;;) {
    const entries = await listEntries();
    const mcp = await listMcpEntries();
    if (entries.length === 0 && mcp.length === 0) {
      p.note(`Nothing yet. Try ${pc.cyan("Quick start")} from the menu, or ${pc.cyan("perezdev create")}.`, "Empty");
      return;
    }

    const choice = guardCancel(
      await p.select({
        message: "Pick an item",
        options: [
          ...entries.map((e) => ({
            value: e.spec.name,
            label: e.spec.name,
            hint: `${e.spec.targets.join(", ")} · v${e.spec.version}`,
          })),
          ...mcp.map((m) => ({
            value: `${MCP_PREFIX}${m.id}`,
            label: `${m.id} ${pc.dim("(MCP)")}`,
            hint: m.targets.join(", "),
          })),
          { value: BACK, label: pc.dim("← Back") },
        ],
      }),
    ) as string;
    if (choice === BACK) return;

    if (choice.startsWith(MCP_PREFIX)) await mcpActions(choice.slice(MCP_PREFIX.length));
    else await agentActions(choice);
  }
}

/** Action submenu for an MCP server: remove only. */
async function mcpActions(id: string): Promise<void> {
  const ok = guardCancel(
    await p.confirm({ message: `Remove MCP server '${id}' from your tools?`, initialValue: false }),
  );
  if (!ok) return;
  await removeMcpServer(id);
  p.log.success(`Removed MCP server '${id}'.`);
}

/** Action submenu for a single agent; loops until Back or Remove. */
async function agentActions(name: string): Promise<void> {
  for (;;) {
    const action = guardCancel(
      await p.select({
        message: pc.cyan(name),
        options: [
          { value: "show", label: "👁  Show", hint: "spec, files, instructions" },
          { value: "update", label: "🔄 Update", hint: "re-apply files (repair drift)" },
          { value: "bump", label: "⬆️  Bump version", hint: "re-apply + bump patch" },
          { value: "export", label: "📤 Export", hint: "write shareable JSON" },
          { value: "remove", label: "🗑  Remove", hint: "delete from all tools" },
          { value: BACK, label: pc.dim("← Back") },
        ],
      }),
    ) as string;

    switch (action) {
      case "show":
        await runShow(name);
        break;
      case "update":
        await runUpdate(name);
        break;
      case "bump":
        await runUpdate(name, { bump: true });
        break;
      case "export":
        await runExport(name, { out: `${name}.inspo.json` });
        break;
      case "remove":
        if (await removeFlow(name)) return; // agent gone — back to picker
        break;
      case BACK:
      default:
        return;
    }
  }
}

/** Confirm + remove an agent across its tools. Returns true if removed. */
async function removeFlow(name: string): Promise<boolean> {
  const spec = await getAgentSpec(name);
  if (!spec) return true;

  const ok = guardCancel(
    await p.confirm({ message: `Remove '${name}' from ${spec.targets.join(", ")}?`, initialValue: false }),
  );
  if (!ok) return false;

  for (const t of spec.targets) await getAdapter(t).remove(spec);
  await removeAgentEntry(name);
  p.log.success(`Removed '${name}'.`);
  return true;
}
