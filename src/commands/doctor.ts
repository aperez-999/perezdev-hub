import pc from "picocolors";
import { getAdapter, detectAll } from "../adapters/registry.js";
import { listEntries, listMcpEntries } from "../core/lockfile.js";
import { readIfExists } from "../util/fs-safe.js";
import { p } from "../ui/prompts.js";

/**
 * Diagnose config drift: for every lockfile entry, confirm each target tool
 * still holds the agent. Reports missing tools and files deleted out-of-band.
 */
export async function runDoctor(): Promise<void> {
  p.intro(pc.bgMagenta(pc.black(" perezdev doctor ")));

  const detected = await detectAll();
  const installedIds = new Set(detected.filter((d) => d.detection.installed).map((d) => d.adapter.id));

  const entries = await listEntries();
  const mcpEntries = await listMcpEntries();
  if (entries.length === 0 && mcpEntries.length === 0) {
    p.outro("Nothing recorded yet — nothing to diagnose.");
    return;
  }

  const problems: string[] = [];
  const oks: string[] = [];

  for (const { spec } of entries) {
    for (const t of spec.targets) {
      const present = (await getAdapter(t).list()).some((i) => i.name === spec.name);
      if (present) {
        oks.push(`${pc.green("●")} ${spec.name} → ${t}`);
      } else if (!installedIds.has(t)) {
        problems.push(`${pc.yellow("●")} ${spec.name} → ${t}: tool not detected on this machine`);
      } else {
        problems.push(
          `${pc.red("●")} ${spec.name} → ${t}: missing (deleted out-of-band) — run ${pc.cyan(`perezdev update ${spec.name}`)}`,
        );
      }
    }
  }

  // MCP servers: confirm each is still present in its tool's MCP config.
  for (const entry of mcpEntries) {
    for (const t of entry.targets) {
      const path = getAdapter(t).mcpConfigPath?.();
      const raw = path ? await readIfExists(path) : null;
      const present = raw ? new RegExp(`"${entry.id}"`).test(raw) : false;
      if (present) oks.push(`${pc.green("●")} mcp:${entry.id} → ${t}`);
      else problems.push(`${pc.red("●")} mcp:${entry.id} → ${t}: missing from config`);
    }
  }

  if (oks.length) p.note(oks.join("\n"), "Healthy");
  if (problems.length) p.note(problems.join("\n"), "Issues");

  const total = entries.length + mcpEntries.length;
  p.outro(
    problems.length === 0
      ? `${pc.green("✓")} All ${total} item(s) healthy.`
      : `${pc.yellow("!")} ${problems.length} issue(s) found.`,
  );
}
