import { agentFiles, mcpFiles } from "../adapters/plan.js";
import { mcpEntryMatches, mcpFormat } from "../adapters/mcp-config.js";
import { detectedTools } from "../adapters/tools.js";
import { basename } from "node:path";
import { readSection } from "../adapters/context.js";
import { readIfExists } from "../util/fs-safe.js";
import { contextSections } from "./context.js";
import type { McpDependency, ToolId } from "./agent-spec.js";
import { commit } from "./install.js";
import { readLock } from "./lockfile.js";
import type { Scope } from "./scope.js";

/**
 * - `missing`: a file or server perezdev recorded is gone.
 * - `modified`: it exists but no longer matches the lockfile (edited by hand,
 *   or the lockfile changed without re-applying — e.g. a teammate's commit).
 * - `tool-absent`: missing, but the tool isn't installed here (user scope only).
 */
export type DoctorStatus = "ok" | "missing" | "modified" | "tool-absent";

export interface DoctorItem {
  kind: "agent" | "mcp" | "context";
  name: string;
  /** The tool affected; absent for shared files (AGENTS.md, CLAUDE.md). */
  target?: ToolId;
  status: DoctorStatus;
  /** The first file that isn't ok, when there is one. */
  path?: string;
}

const RANK: Record<DoctorStatus, number> = { ok: 0, "tool-absent": 1, modified: 2, missing: 3 };

async function fileStatus(path: string, expected: string): Promise<DoctorStatus> {
  const actual = await readIfExists(path);
  if (actual === null) return "missing";
  return actual === expected ? "ok" : "modified";
}

async function mcpStatus(path: string, dep: McpDependency): Promise<DoctorStatus> {
  let servers: Record<string, unknown>;
  try {
    servers = mcpFormat(path).servers(path, await readIfExists(path));
  } catch {
    return "modified";
  }
  const entry = servers[dep.name];
  if (entry === undefined) return "missing";
  return mcpEntryMatches(entry, dep) ? "ok" : "modified";
}

/** Compare everything in the scope's lockfile against what's on disk. */
export async function diagnose(scope: Scope): Promise<DoctorItem[]> {
  const lock = await readLock(scope);
  // In a project, files are committed — a tool being absent on this machine is irrelevant.
  const installed = scope.kind === "user" ? new Set(await detectedTools(scope)) : null;
  const items: DoctorItem[] = [];

  const push = (item: Omit<DoctorItem, "status">, worst: { status: DoctorStatus; path?: string }) => {
    const status = worst.status === "missing" && installed && item.target && !installed.has(item.target) ? "tool-absent" : worst.status;
    items.push({ ...item, status, ...(worst.path && status !== "ok" ? { path: worst.path } : {}) });
  };

  for (const { spec } of Object.values(lock.agents)) {
    const files = agentFiles(spec, scope);
    for (const target of spec.targets) {
      let worst: { status: DoctorStatus; path?: string } = { status: "ok" };
      const consider = (status: DoctorStatus, path: string) => {
        if (RANK[status] > RANK[worst.status]) worst = { status, path };
      };
      for (const f of files.filter((f) => f.tools.includes(target))) consider(await fileStatus(f.path, f.render(spec)), f.path);
      for (const { path } of mcpFiles([target], scope)) {
        for (const dep of spec.mcpDependencies) consider(await mcpStatus(path, dep), path);
      }
      push({ kind: "agent", name: spec.name, target }, worst);
    }
  }

  for (const entry of Object.values(lock.mcpServers)) {
    for (const target of entry.targets) {
      for (const { path } of mcpFiles([target], scope)) {
        push({ kind: "mcp", name: entry.id, target }, { status: await mcpStatus(path, entry.dependency), path });
      }
    }
  }
  if (lock.agentsMd) {
    for (const section of await contextSections(scope, lock)) {
      if (section.body === null) continue;
      const actual = readSection(await readIfExists(section.path));
      const status: DoctorStatus = actual === null ? "missing" : actual === section.body.trim() ? "ok" : "modified";
      push({ kind: "context", name: basename(section.path) }, { status, path: section.path });
    }
  }
  return items;
}

/** Re-apply every lockfile entry with drift (missing or modified). Returns how many were repaired. */
export async function repair(scope: Scope, items: DoctorItem[], opts: { force?: boolean } = {}): Promise<number> {
  const broken = (kind: DoctorItem["kind"]) =>
    new Set(items.filter((i) => i.kind === kind && (i.status === "missing" || i.status === "modified")).map((i) => i.name));
  const agents = broken("agent");
  const servers = broken("mcp");
  const context = broken("context");
  if (agents.size === 0 && servers.size === 0 && context.size === 0) return 0;

  const lock = await readLock(scope);
  await commit(
    scope,
    {
      agents: [...agents].map((n) => lock.agents[n]!.spec),
      mcp: [...servers].map((id) => {
        const e = lock.mcpServers[id]!;
        return { id: e.id, name: e.name, dependency: e.dependency, targets: e.targets };
      }),
    },
    opts,
  );
  return agents.size + servers.size + context.size;
}

export function doctorLabel(item: DoctorItem): string {
  return item.kind === "mcp" ? `mcp:${item.name}` : item.name;
}

/** "reviewer → Cursor", or just "AGENTS.md" for shared files. */
export function doctorSubject(item: DoctorItem, name: (id: ToolId) => string): string {
  return item.target ? `${doctorLabel(item)} → ${name(item.target)}` : doctorLabel(item);
}

/** Machine-readable doctor result. `ok` means no drift (nothing missing or modified). */
export interface DoctorReport {
  ok: boolean;
  total: number;
  missing: number;
  modified: number;
  absent: number;
  repaired: number;
  items: DoctorItem[];
}

export function summarize(items: DoctorItem[], repaired = 0): DoctorReport {
  const count = (s: DoctorStatus) => items.filter((i) => i.status === s).length;
  const missing = count("missing");
  const modified = count("modified");
  return { ok: missing === 0 && modified === 0, total: items.length, missing, modified, absent: count("tool-absent"), repaired, items };
}

/** Non-zero on drift. `--strict` also fails when a target tool isn't installed. */
export function doctorExitCode(report: DoctorReport, strict = false): number {
  if (!report.ok) return 1;
  if (strict && report.absent > 0) return 1;
  return 0;
}

/** One-line verdict. Never recommends `--fix` for tool-absent. */
export function doctorAdvice(items: DoctorItem[]): string {
  const { missing, modified, absent, total } = summarize(items);
  if (total === 0) return "nothing recorded yet";
  if (missing + modified + absent === 0) return `all ${total} check(s) healthy`;
  const parts: string[] = [];
  if (missing > 0) parts.push(`${missing} missing`);
  if (modified > 0) parts.push(`${modified} modified`);
  const drift = parts.length > 0 ? `${parts.join(", ")} — repair with perezdev doctor --fix` : "";
  const absentNote = absent > 0 ? `${absent} for tools not installed here` : "";
  return [drift, absentNote].filter(Boolean).join("; ");
}
