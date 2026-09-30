import { join } from "node:path";
import { AGENTS_MD, AGENTS_PREAMBLE, CLAUDE_IMPORT, CLAUDE_MD, CLAUDE_PREAMBLE, importsAgentsMd, renderCommands } from "../adapters/context.js";
import { readIfExists } from "../util/fs-safe.js";
import { detectCommands } from "./commands.js";
import type { Lockfile } from "./lockfile.js";
import type { Scope } from "./scope.js";
import { resolveTargets } from "./targets.js";

/** perezdev's block in one shared file: what it should contain (null = no block). */
export interface ContextSection {
  path: string;
  body: string | null;
  preamble: string;
}

/**
 * The managed sections a project's lockfile asks for: a Commands section in
 * AGENTS.md (read by Codex, Cursor, Copilot, Windsurf, Cline, Roo), plus an
 * `@AGENTS.md` import in CLAUDE.md for Claude Code. Commands are recomputed
 * from the repo's manifests every time, so `doctor` notices when they go stale.
 *
 * Whether CLAUDE.md gets the import depends only on the repo — a CLAUDE.md is
 * already there, or an agent targets Claude Code — so `doctor` gives the same
 * answer on a laptop and in CI. The one exception is `enabling`: when the
 * section is first switched on, Claude Code installed on this machine is
 * enough to create CLAUDE.md.
 */
export async function contextSections(scope: Scope, lock: Lockfile, opts: { enabling?: boolean } = {}): Promise<ContextSection[]> {
  if (scope.kind !== "project") return [];
  const agentsPath = join(scope.root, AGENTS_MD);
  const claudePath = join(scope.root, CLAUDE_MD);

  const commands = lock.agentsMd ? await detectCommands(scope.root) : [];
  const body = commands.length > 0 ? renderCommands(commands) : null;

  const claudeRaw = await readIfExists(claudePath);
  let claudeInUse = claudeRaw !== null || Object.values(lock.agents).some((e) => e.spec.targets.includes("claude-code"));
  if (!claudeInUse && opts.enabling) {
    const resolved = await resolveTargets(scope);
    claudeInUse = resolved.source !== "all" && resolved.targets.includes("claude-code");
  }
  const link = body !== null && claudeInUse && !importsAgentsMd(claudeRaw) ? CLAUDE_IMPORT : null;

  return [
    { path: agentsPath, body, preamble: AGENTS_PREAMBLE },
    { path: claudePath, body: link, preamble: CLAUDE_PREAMBLE },
  ];
}
