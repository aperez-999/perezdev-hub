import { execa } from "execa";

export interface ExecResult {
  command: string;
  code: number;
  stdout: string;
  stderr: string;
  /** Set when the command was refused (denylist) or could not start. */
  blocked?: string;
}

// Commands we refuse to run even in Autonomous mode — irreversible, escalating,
// or remote-code patterns that have no place in an auto-fix loop.
const DANGER = [
  /\brm\s+(-[a-z]*r|-[a-z]*f|--recursive|--force)/i,
  /\brm\s+-\w*\s+\//,
  /\bsudo\b/i,
  /\bdd\b\s+if=/i,
  /\bmkfs\b/i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /:\s*\(\s*\)\s*\{/, // fork bomb
  /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/i, // curl … | sh
  /\bgit\s+push\b/i,
  /--force\b|\s-f\b/, // force flags (e.g. push -f)
  />\s*\/dev\/(sd|disk|null\/)/i,
  /\bchmod\s+-R?\s*0?777\b/i,
  /\b(npm|pnpm|yarn)\s+publish\b/i,
];

/** Pure check: is this command on the destructive denylist? Returns the reason or null. */
export function isDangerous(command: string): string | null {
  for (const re of DANGER) if (re.test(command)) return `refused: '${command}' matches a destructive pattern`;
  return null;
}

/**
 * Run a shell command, capturing stdout/stderr/exit code without throwing.
 * Destructive commands are refused before they run. Always resolves.
 */
export async function runCommand(
  command: string,
  opts: { cwd?: string; timeout?: number } = {},
): Promise<ExecResult> {
  const blocked = isDangerous(command);
  if (blocked) return { command, code: 126, stdout: "", stderr: blocked, blocked };
  try {
    const r = await execa("/bin/sh", ["-c", command], {
      cwd: opts.cwd ?? process.cwd(),
      timeout: opts.timeout ?? 120_000,
      reject: false,
      all: false,
    });
    return { command, code: r.exitCode ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { command, code: 1, stdout: "", stderr: msg };
  }
}
