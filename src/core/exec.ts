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

// Package managers + the only subcommands an auto-fix loop may invoke. A model
// can suggest *installing a dependency* and nothing else — no arbitrary shell.
const INSTALL_RULES: Record<string, Set<string>> = {
  npm: new Set(["install", "i", "add", "ci"]),
  pnpm: new Set(["install", "i", "add"]),
  yarn: new Set(["add", "install"]),
  pip: new Set(["install"]),
  pip3: new Set(["install"]),
  poetry: new Set(["add", "install"]),
  uv: new Set(["add", "pip"]),
  pipenv: new Set(["install"]),
  go: new Set(["get", "install"]),
  cargo: new Set(["add"]),
  gem: new Set(["install"]),
  bundle: new Set(["add", "install"]),
};
// Package specs, version ranges, and simple flags. No shell metacharacters.
const SAFE_INSTALL_ARG = /^[A-Za-z0-9@._/+:^~=<>-]+$/;
// Any of these means the string is trying to do more than name packages.
const SHELL_META = /[;&|`$(){}<>*?!\\"'\n]/;

/**
 * Validate an LLM-proposed install command against the allowlist. Returns the
 * argv to execute (no shell) or a refusal reason — never lets free-form shell
 * through. The model controls this string, so the gate is strict by design.
 */
export function parseInstallCommand(command: string): { argv: string[] } | { reason: string } {
  const trimmed = command.trim();
  if (!trimmed) return { reason: "empty install command" };
  if (SHELL_META.test(trimmed)) return { reason: `refused: install command contains shell metacharacters` };
  const argv = trimmed.split(/\s+/);
  const [bin, sub] = argv;
  const allowed = bin ? INSTALL_RULES[bin] : undefined;
  if (!bin || !allowed) return { reason: `refused: '${bin ?? ""}' is not an allowed package manager` };
  if (!sub || !allowed.has(sub)) return { reason: `refused: '${bin} ${sub ?? ""}' is not an allowed install subcommand` };
  for (const arg of argv.slice(2)) {
    if (!SAFE_INSTALL_ARG.test(arg)) return { reason: `refused: unsafe argument '${arg}'` };
    const lower = arg.toLowerCase();
    if (arg === "-g" || arg === "--global" || arg === "--prefix" || arg.startsWith("--prefix=")) {
      return { reason: `refused: global/prefix install is not allowed ('${arg}')` };
    }
    if (lower.includes("git+") || lower.includes("://")) {
      return { reason: `refused: URL / git specs are not allowed ('${arg}')` };
    }
  }
  return { argv };
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

/**
 * Run an LLM-proposed dependency install. Unlike {@link runCommand} this never
 * touches a shell: the command must pass {@link parseInstallCommand}'s allowlist
 * and is executed as a bare argv. Refused commands resolve with `blocked` set.
 */
export async function runInstall(
  command: string,
  opts: { cwd?: string; timeout?: number } = {},
): Promise<ExecResult> {
  const parsed = parseInstallCommand(command);
  if ("reason" in parsed) return { command, code: 126, stdout: "", stderr: parsed.reason, blocked: parsed.reason };
  const [bin, ...args] = parsed.argv;
  try {
    const r = await execa(bin!, args, {
      cwd: opts.cwd ?? process.cwd(),
      timeout: opts.timeout ?? 120_000,
      reject: false,
      all: false,
      shell: false,
    });
    return { command, code: r.exitCode ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { command, code: 1, stdout: "", stderr: msg };
  }
}
