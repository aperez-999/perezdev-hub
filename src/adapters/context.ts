import type { RepoCommand } from "../core/commands.js";

/**
 * perezdev's block inside a shared, hand-written file (AGENTS.md, CLAUDE.md).
 * Everything outside the markers belongs to the user and is never touched.
 */
const BEGIN = "<!-- perezdev:begin -->";
const END = "<!-- perezdev:end -->";
const BLOCK = /\n*<!-- perezdev:begin -->[\s\S]*?<!-- perezdev:end -->\n?/;

export const AGENTS_MD = "AGENTS.md";
export const CLAUDE_MD = "CLAUDE.md";
/** Claude Code reads CLAUDE.md, not AGENTS.md; this import line makes it read both. */
export const CLAUDE_IMPORT = "@AGENTS.md";

export const AGENTS_PREAMBLE = "# AGENTS.md\n\nInstructions for AI coding agents working in this repository.\n";
export const CLAUDE_PREAMBLE = "# CLAUDE.md\n";

/** The text between the markers, or null when there's no block. */
export function readSection(raw: string | null): string | null {
  if (!raw) return null;
  const start = raw.indexOf(BEGIN);
  const end = raw.indexOf(END);
  if (start < 0 || end < start) return null;
  return raw.slice(start + BEGIN.length, end).replace(/\r\n/g, "\n").trim();
}

/**
 * Put `body` in the block (creating the file from `preamble` if needed), or
 * take the block out when `body` is null. Returns the new contents, "" when the
 * file would hold nothing but our preamble (delete it), or null for no change.
 */
export function upsertSection(raw: string | null, body: string | null, preamble: string): string | null {
  const block = body === null ? null : `${BEGIN}\n${body.trim()}\n${END}\n`;
  let next: string;
  if (raw !== null && BLOCK.test(raw)) {
    next = raw.replace(BLOCK, block === null ? "\n" : `\n\n${block}`).replace(/^\n+/, "");
  } else if (block === null) {
    return null;
  } else {
    next = `${(raw ?? preamble).replace(/\s+$/, "")}\n\n${block}`;
  }
  next = next.replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "\n");
  if (block === null && next.trim() === preamble.trim()) return "";
  return next === raw ? null : next;
}

/** Does CLAUDE.md already import AGENTS.md on its own (outside our block)? */
export function importsAgentsMd(raw: string | null): boolean {
  if (!raw) return false;
  return raw.replace(BLOCK, "").split("\n").some((l) => l.trim() === CLAUDE_IMPORT);
}

export function renderCommands(commands: RepoCommand[]): string {
  return [
    "## Commands",
    "",
    "Use these instead of guessing. Run them from the repository root.",
    "",
    ...commands.map((c) => `- ${c.label}: \`${c.command}\``),
    "",
    "<!-- Generated from the repo's manifests by perezdev. Refresh with `perezdev sync`; edit outside the markers. -->",
  ].join("\n");
}
