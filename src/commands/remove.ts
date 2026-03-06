import pc from "picocolors";
import { getAdapter } from "../adapters/registry.js";
import { getAgentSpec, getMcpEntry, removeAgentEntry } from "../core/lockfile.js";
import { removeMcpServer } from "../core/mcp-install.js";
import { p, guardCancel } from "../ui/prompts.js";

/** Remove a managed agent (or standalone MCP server) by name/id across tools. */
export async function runRemove(name: string): Promise<void> {
  p.intro(pc.bgRed(pc.black(" perezdev remove ")));

  const spec = await getAgentSpec(name);
  if (!spec) {
    // Fall back to a standalone MCP server with this id.
    const mcp = await getMcpEntry(name);
    if (mcp) {
      const ok = guardCancel(
        await p.confirm({ message: `Remove MCP server '${name}' from ${mcp.targets.join(", ")}?`, initialValue: false }),
      );
      if (!ok) {
        p.cancel("Aborted.");
        process.exit(0);
      }
      await removeMcpServer(name);
      p.outro(`${pc.green("✓")} Removed MCP server '${name}'.`);
      return;
    }
    p.cancel(`No managed agent or MCP server named '${name}'. Run ${pc.cyan("perezdev list")}.`);
    process.exit(1);
  }

  const confirm = guardCancel(
    await p.confirm({
      message: `Remove '${name}' from ${spec.targets.join(", ")} (backups restored)?`,
    }),
  );
  if (!confirm) {
    p.cancel("Aborted.");
    process.exit(0);
  }

  const removedFrom: string[] = [];
  for (const t of spec.targets) {
    if (await getAdapter(t).remove(spec)) removedFrom.push(t);
  }
  await removeAgentEntry(name);

  p.outro(
    removedFrom.length > 0
      ? `${pc.green("✓")} Removed '${name}' from ${removedFrom.join(", ")}.`
      : `Lockfile entry cleared. No files were present to remove.`,
  );
}
