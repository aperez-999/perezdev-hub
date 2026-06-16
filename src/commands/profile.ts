import { writeFile } from "node:fs/promises";
import pc from "picocolors";
import * as p from "@clack/prompts";
import { listEntries, listMcpEntries, getAgentSpec, getMcpEntry } from "../core/lockfile.js";
import { installSpec, planSpec } from "../core/install.js";
import { installMcpServer, planMcpServer } from "../core/mcp-install.js";
import { resolveTargets } from "../core/targets.js";
import { readIfExists } from "../util/fs-safe.js";
import { renderDiff } from "../ui/prompts.js";
import type { PlannedFile } from "../adapters/types.js";
import { buildProfile, parseProfile, profileToServer, type Profile } from "../core/profile.js";

interface ExportOpts {
  out?: string;
}
interface ImportOpts {
  target?: string;
  yes?: boolean;
  force?: boolean;
  dryRun?: boolean;
}
interface ShowOpts {
  json?: boolean;
}

/**
 * Reject URLs pointing at loopback, link-local (incl. cloud metadata at
 * 169.254.169.254), or private ranges so a profile URL can't be used to probe
 * internal services. Hostname-only check — paired with disabled redirects below.
 */
function assertPublicUrl(url: URL): void {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const blockedNames = host === "localhost" || host.endsWith(".local") || host.endsWith(".internal");
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  let blockedIp = false;
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    blockedIp =
      a === 127 || a === 0 || a === 10 || // loopback, "this host", private
      (a === 169 && b === 254) || // link-local / cloud metadata
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168); // private
  }
  const blockedV6 = host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
  if (blockedNames || blockedIp || blockedV6) {
    throw new Error(`refused: '${url.hostname}' is a local/private address`);
  }
}

/** Resolve a profile reference (http(s) URL or local file) to its text. */
async function readRef(ref: string): Promise<string> {
  if (/^https?:\/\//.test(ref)) {
    const url = new URL(ref);
    assertPublicUrl(url);
    // No redirect following: a public URL could otherwise 30x to a private host.
    const res = await fetch(url, { redirect: "error" });
    if (!res.ok) throw new Error(`fetch failed (${res.status}) for ${ref}`);
    return res.text();
  }
  const text = await readIfExists(ref);
  if (text === null) throw new Error(`file not found: ${ref}`);
  return text;
}

/** Bundle the current setup into a shareable profile JSON. */
export async function runProfileExport(opts: ExportOpts = {}): Promise<void> {
  const profile = buildProfile(await listEntries(), await listMcpEntries(), "profile", new Date().toISOString());
  if (profile.agents.length === 0 && profile.mcp.length === 0) {
    console.error(pc.yellow("Nothing to export yet. Create or install agents first (perezdev create)."));
    process.exit(1);
  }
  const json = JSON.stringify(profile, null, 2) + "\n";
  if (opts.out === "-") {
    process.stdout.write(json);
    return;
  }
  const out = opts.out || "perezdev-profile.json";
  await writeFile(out, json, "utf8");
  console.log(
    `${pc.green("✓")} Exported ${pc.bold(String(profile.agents.length))} agent(s) and ${pc.bold(String(profile.mcp.length))} MCP server(s) → ${pc.cyan(out)}`,
  );
}

function summarize(profile: Profile): string {
  const a = profile.agents.map((x) => x.name).join(", ") || "—";
  const m = profile.mcp.map((x) => x.id).join(", ") || "—";
  return `  agents: ${a}\n  mcp:    ${m}`;
}

/** Preview a profile without installing anything. */
export async function runProfileShow(ref: string, opts: ShowOpts = {}): Promise<void> {
  const profile = parseProfile(await readRef(ref));
  if (opts.json) {
    console.log(JSON.stringify(profile, null, 2));
    return;
  }
  console.log(`\n  ${pc.bold(profile.name)}${profile.createdAt ? pc.dim(`  (${profile.createdAt})`) : ""}`);
  console.log(summarize(profile) + "\n");
}

/** Install every agent + MCP server from a profile across the chosen tools. */
export async function runProfileImport(ref: string, opts: ImportOpts = {}): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" perezdev profile import ")));
  let profile: Profile;
  try {
    profile = parseProfile(await readRef(ref));
  } catch (err) {
    p.cancel(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const { targets } = await resolveTargets(opts.target);

  if (opts.dryRun) {
    const planned: PlannedFile[] = [];
    for (const spec of profile.agents) planned.push(...(await planSpec({ ...spec, targets })));
    for (const entry of profile.mcp) planned.push(...(await planMcpServer(profileToServer(entry), targets)));
    p.note(summarize(profile), `Profile: ${profile.name}`);
    p.note(renderDiff(planned), "Files to write");
    p.outro(pc.dim(`dry run — nothing written. Drop --dry-run to install to ${targets.join(", ")}.`));
    return;
  }

  p.note(summarize(profile), `Profile: ${profile.name}`);
  if (!opts.yes && process.stdout.isTTY) {
    const ok = await p.confirm({ message: `Install to ${targets.join(", ")}?` });
    if (ok !== true) {
      p.cancel("Aborted.");
      process.exit(0);
    }
  }

  const now = new Date().toISOString();
  let agentsInstalled = 0;
  let agentsSkipped = 0;
  let mcpInstalled = 0;
  let mcpSkipped = 0;
  const failures: string[] = [];

  for (const spec of profile.agents) {
    if (!opts.force && (await getAgentSpec(spec.name))) {
      agentsSkipped++;
      continue;
    }
    try {
      await installSpec({ ...spec, targets }, now);
      agentsInstalled++;
    } catch (err) {
      failures.push(`agent ${spec.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const entry of profile.mcp) {
    if (!opts.force && (await getMcpEntry(entry.id))) {
      mcpSkipped++;
      continue;
    }
    try {
      await installMcpServer(profileToServer(entry), targets, now);
      mcpInstalled++;
    } catch (err) {
      failures.push(`mcp ${entry.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const f of failures) console.log(pc.red(`  ✗ ${f}`));
  p.outro(
    `${pc.green("✓")} Imported — agents: ${agentsInstalled} installed, ${agentsSkipped} skipped · ` +
      `mcp: ${mcpInstalled} installed, ${mcpSkipped} skipped${failures.length ? ` · ${failures.length} failed` : ""}.`,
  );
  if (failures.length) process.exitCode = 1;
}
