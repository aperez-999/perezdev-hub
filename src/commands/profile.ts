import { writeFile } from "node:fs/promises";
import pc from "picocolors";
import { readLock } from "../core/lockfile.js";
import { planChanges } from "../core/install.js";
import { resolveScope, type ScopeOptions } from "../core/scope.js";
import { resolveTargets } from "../core/targets.js";
import { readIfExists } from "../util/fs-safe.js";
import { confirmAndApply, type ApplyOptions } from "../ui/apply.js";
import { p, intro } from "../ui/prompts.js";
import { buildProfile, parseProfile, type Profile } from "../core/profile.js";

interface ExportOpts extends ScopeOptions {
  out?: string;
}
interface ImportOpts extends ScopeOptions, ApplyOptions {
  target?: string;
  /** Replace agents/servers that already exist in this scope. */
  overwrite?: boolean;
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

export const PROFILE_FETCH_MAX_BYTES = 512_000;
const PROFILE_FETCH_MS = 8_000;

/** Resolve a profile reference (http(s) URL or local file) to its text. */
export async function readRef(ref: string): Promise<string> {
  if (/^https?:\/\//.test(ref)) {
    const url = new URL(ref);
    if (url.protocol !== "https:") throw new Error("refused: profile URLs must use https");
    assertPublicUrl(url);
    // No redirect following: a public URL could otherwise 30x to a private host.
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(PROFILE_FETCH_MS) });
    if (!res.ok) throw new Error(`fetch failed (${res.status}) for ${ref}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > PROFILE_FETCH_MAX_BYTES) {
      throw new Error(`refused: profile larger than ${PROFILE_FETCH_MAX_BYTES} bytes`);
    }
    return new TextDecoder().decode(buf);
  }
  const text = await readIfExists(ref);
  if (text === null) throw new Error(`file not found: ${ref}`);
  return text;
}

/** Bundle the current setup into a shareable profile JSON. */
export async function runProfileExport(opts: ExportOpts = {}): Promise<void> {
  const lock = await readLock(await resolveScope(opts));
  const profile = buildProfile(Object.values(lock.agents), Object.values(lock.mcpServers), "profile", new Date().toISOString());
  if (profile.agents.length === 0 && profile.mcp.length === 0) {
    console.error(pc.yellow("Nothing to export yet. Install agents first (perezdev create)."));
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
  return `agents: ${a}\nmcp:    ${m}`;
}

/** Preview a profile without installing anything. */
export async function runProfileShow(ref: string, opts: ShowOpts = {}): Promise<void> {
  const profile = parseProfile(await readRef(ref));
  if (opts.json) {
    console.log(JSON.stringify(profile, null, 2));
    return;
  }
  console.log(`\n  ${pc.bold(profile.name)}${profile.createdAt ? pc.dim(`  (${profile.createdAt})`) : ""}`);
  console.log(summarize(profile).split("\n").map((l) => `  ${l}`).join("\n") + "\n");
}

/** Install every agent + MCP server from a profile across the chosen tools. */
export async function runProfileImport(ref: string, opts: ImportOpts = {}): Promise<void> {
  const scope = await resolveScope(opts);
  intro("profile import", scope);
  let profile: Profile;
  try {
    profile = parseProfile(await readRef(ref));
  } catch (err) {
    p.cancel(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const { targets } = await resolveTargets(scope, opts.target);
  const lock = await readLock(scope);
  const agents = profile.agents.filter((a) => opts.overwrite || !lock.agents[a.name]);
  const mcp = profile.mcp.filter((m) => opts.overwrite || !lock.mcpServers[m.id]);
  const kept = profile.agents.length - agents.length + profile.mcp.length - mcp.length;

  p.note(summarize(profile), `Profile: ${profile.name}`);
  if (kept > 0) p.log.info(`${kept} item(s) already installed here — kept as-is (--overwrite to replace).`);

  const plan = await planChanges(scope, {
    agents: agents.map((spec) => ({ ...spec, source: "imported" as const, targets })),
    mcp: mcp.map((m) => ({ id: m.id, name: m.name, dependency: m.dependency, targets })),
  });
  await confirmAndApply(plan, `Install profile '${profile.name}'?`, opts);
  if (opts.dryRun) return;
  p.outro(`${pc.green("✓")} Imported ${agents.length} agent(s) and ${mcp.length} MCP server(s).`);
}
