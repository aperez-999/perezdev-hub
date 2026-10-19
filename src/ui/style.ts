import pc from "picocolors";

/**
 * perezdev's one accent color. Commands you can run stay cyan, values stay
 * plain, labels stay dim, and status keeps green / yellow / red — the accent
 * only marks perezdev's own headings, so output reads at a glance.
 * Plain text whenever color is off (NO_COLOR, pipes, CI logs without a TTY).
 */
export function accent(text: string): string {
  return pc.isColorSupported ? `\x1b[38;5;141m${text}\x1b[39m` : text;
}

/** A section heading inside perezdev's output. */
export function heading(text: string): string {
  return accent(pc.bold(text));
}

/** The mark that opens each command's output: `◆ perezdev <command>`. */
export function mark(command?: string): string {
  return `${accent(`◆ ${pc.bold("perezdev")}`)}${command ? ` ${pc.bold(command)}` : ""}`;
}
