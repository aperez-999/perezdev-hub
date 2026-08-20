import { join } from "node:path";
import { exists } from "../util/fs-safe.js";
import { home } from "./config.js";
import { isCursorHost } from "./host.js";

export interface EcoTool {
  id: string;
  label: string;
  kind: "ide" | "cli";
  present: boolean;
}

/** Any-of presence check for a tool's config footprint. */
async function any(paths: string[]): Promise<boolean> {
  for (const p of paths) if (await exists(p)) return true;
  return false;
}

/**
 * Detect which AI coding tools the developer actually uses, by scanning the
 * workspace and global config locations — no hardcoded badges. Mirrors the real
 * machine footprint so the header reflects exactly what's installed/configured.
 */
export async function scanEcosystem(dir: string = process.cwd(), h: string = home()): Promise<EcoTool[]> {
  const ide: [string, string, string[]][] = [
    ["cursor", "cursor", [join(dir, ".cursor", "rules"), join(dir, ".cursorrules")]],
    ["copilot", "copilot", [join(dir, ".github", "copilot-instructions.md")]],
    ["cline", "cline", [join(dir, ".clinerules")]],
    ["windsurf", "windsurf", [join(dir, ".windsurfrules")]],
    ["roo", "roo", [join(dir, ".roo"), join(dir, ".roorules"), join(h, ".roo", "rules")]],
  ];
  const cli: [string, string, string[]][] = [
    ["claude-code", "claude-code", [join(h, ".claude", "settings.json"), join(h, ".claude")]],
    ["codex", "codex", [join(h, ".codex"), join(dir, "AGENTS.md")]],
    ["aider", "aider", [join(dir, ".aider.conf.yml"), join(dir, ".aider.instructions.md"), join(h, ".aider.conf.yml")]],
  ];

  const cursorHost = isCursorHost();
  const out: EcoTool[] = [];
  for (const [id, label, paths] of ide) {
    const fromDisk = await any(paths);
    const present = id === "cursor" ? fromDisk || cursorHost : fromDisk;
    out.push({ id, label, kind: "ide", present });
  }
  for (const [id, label, paths] of cli) out.push({ id, label, kind: "cli", present: await any(paths) });
  return out;
}
