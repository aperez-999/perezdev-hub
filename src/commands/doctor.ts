import pc from "picocolors";
import { getAdapter, detectAll } from "../adapters/registry.js";
import type { ToolId } from "../core/agent-spec.js";
import { listEntries, listMcpEntries } from "../core/lockfile.js";
import { installSpec } from "../core/install.js";
import { installMcpServer } from "../core/mcp-install.js";
import { profileToServer } from "../core/profile.js";
import { readIfExists } from "../util/fs-safe.js";
import { p } from "../ui/prompts.js";

export interface DoctorOptions {
  /** Re-apply the lockfile to repair anything missing (backed up, atomic). */
  fix?: boolean;
  /** Emit machine-readable JSON instead of the interactive report. */
  json?: boolean;
}

type ItemStatus = "ok" | "missing" | "tool-absent";
interface DoctorItem {
  kind: "agent" | "mcp";
  name: string;
  target: ToolId;
  status: ItemStatus;
}

/** Does the tool's MCP config actually contain this server id? Parses JSON (no regex guessing). */
async function mcpPresent(target: ToolId, id: string): Promise<boolean> {
  const path = getAdapter(target).mcpConfigPath?.();
  const raw = path ? await readIfExists(path) : null;
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
    return Boolean(parsed.mcpServers && id in parsed.mcpServers);
  } catch {
    return false;
  }
}

/** Build the full health picture from the lockfile vs. what's actually on disk. */
async function diagnose(): Promise<DoctorItem[]> {
  const detected = await detectAll();
  const installedIds = new Set(detected.filter((d) => d.detection.installed).map((d) => d.adapter.id));
  const items: DoctorItem[] = [];

  for (const { spec } of await listEntries()) {
    for (const t of spec.targets) {
      const present = (await getAdapter(t).list()).some((i) => i.name === spec.name);
      items.push({
        kind: "agent",
        name: spec.name,
        target: t,
        status: present ? "ok" : installedIds.has(t) ? "missing" : "tool-absent",
      });
    }
  }
  for (const entry of await listMcpEntries()) {
    for (const t of entry.targets) {
      items.push({ kind: "mcp", name: entry.id, target: t, status: (await mcpPresent(t, entry.id)) ? "ok" : "missing" });
    }
  }
  return items;
}

/** Re-apply every lockfile entry that has a repairable (missing) target. Returns count repaired. */
async function repair(items: DoctorItem[]): Promise<number> {
  const now = new Date().toISOString();
  const brokenAgents = new Set(items.filter((i) => i.kind === "agent" && i.status === "missing").map((i) => i.name));
  const brokenMcp = new Set(items.filter((i) => i.kind === "mcp" && i.status === "missing").map((i) => i.name));

  let repaired = 0;
  for (const { spec } of await listEntries()) {
    if (brokenAgents.has(spec.name)) {
      await installSpec(spec, now);
      repaired++;
    }
  }
  for (const entry of await listMcpEntries()) {
    if (brokenMcp.has(entry.id)) {
      await installMcpServer(profileToServer(entry), entry.targets, now);
      repaired++;
    }
  }
  return repaired;
}

const label = (i: DoctorItem): string => (i.kind === "mcp" ? `mcp:${i.name}` : i.name);

/**
 * Diagnose config drift: for every lockfile entry, confirm each target tool
 * still holds the agent/server. With `--fix`, re-applies anything missing.
 */
export async function runDoctor(opts: DoctorOptions = {}): Promise<void> {
  const items = await diagnose();

  if (opts.json) {
    let repaired = 0;
    if (opts.fix) repaired = await repair(items);
    const after = opts.fix ? await diagnose() : items;
    const problems = after.filter((i) => i.status !== "ok");
    console.log(
      JSON.stringify(
        { total: after.length, ok: problems.length === 0, problems: problems.length, repaired, items: after },
        null,
        2,
      ),
    );
    if (problems.length > 0) process.exitCode = 1;
    return;
  }

  p.intro(pc.bgMagenta(pc.black(" perezdev doctor ")));

  if (items.length === 0) {
    p.outro("Nothing recorded yet — nothing to diagnose.");
    return;
  }

  if (opts.fix) {
    const repaired = await repair(items);
    if (repaired > 0) p.log.success(`Repaired ${repaired} item(s); re-checking…`);
  }

  const final = opts.fix ? await diagnose() : items;
  const oks = final.filter((i) => i.status === "ok");
  const problems = final.filter((i) => i.status !== "ok");

  if (oks.length) p.note(oks.map((i) => `${pc.green("●")} ${label(i)} → ${i.target}`).join("\n"), "Healthy");
  if (problems.length) {
    p.note(
      problems
        .map((i) => {
          const mark = i.status === "tool-absent" ? pc.yellow("●") : pc.red("●");
          const why =
            i.status === "tool-absent"
              ? "tool not detected on this machine"
              : `missing (deleted out-of-band) — run ${pc.cyan(`perezdev ${i.kind === "mcp" ? "update" : "update " + i.name}`)} or ${pc.cyan("perezdev doctor --fix")}`;
          return `${mark} ${label(i)} → ${i.target}: ${why}`;
        })
        .join("\n"),
      "Issues",
    );
  }

  p.outro(
    problems.length === 0
      ? `${pc.green("✓")} All ${final.length} check(s) healthy.`
      : `${pc.yellow("!")} ${problems.length} issue(s)${opts.fix ? " remain" : ""}. Try ${pc.cyan("perezdev doctor --fix")}.`,
  );
  if (problems.length > 0) process.exitCode = 1;
}
