/** Bins MCP configs may launch. LLM compile and profile import otherwise accept `bash` / `curl`. */
const ALLOWED_BINS = new Set(["npx", "uvx", "docker", "node"]);

const FORBIDDEN_FLAGS = new Set(["-e", "--eval", "-c", "--command", "-g", "--global", "--prefix", "--privileged"]);

/** Shell / remote-fetch patterns that have no place in an MCP argv. */
const UNSAFE_ARG = /[;&|`$(){}<>]|^(https?:|git\+)/i;

/** Why this launch is refused, or null if it is allowlisted. */
export function mcpLaunchError(command: string, args: string[] = []): string | null {
  const bin = command.trim();
  if (!bin) return "refused: MCP command is empty";
  if (/[\\/\s]/.test(bin)) {
    return `refused: MCP command '${bin}' must be an allowlisted binary name`;
  }
  if (!ALLOWED_BINS.has(bin)) {
    return `refused: MCP command '${bin}' is not allowlisted (use npx, uvx, docker, or node)`;
  }
  for (const arg of args) {
    if (FORBIDDEN_FLAGS.has(arg) || arg.startsWith("--prefix=")) {
      return `refused: MCP argument '${arg}' is not allowed`;
    }
    if (UNSAFE_ARG.test(arg) || arg.includes("://")) {
      return `refused: unsafe MCP argument '${arg}'`;
    }
  }
  return null;
}

/** Throw when `command`/`args` would launch something outside the MCP allowlist. */
export function assertSafeMcpLaunch(command: string, args: string[] = []): void {
  const err = mcpLaunchError(command, args);
  if (err) throw new Error(err);
}

/** Keep env keys, replace values — for TUI JSON / `show --json` (lockfile is unchanged). */
export function redactEnv(env: Record<string, string> | undefined): Record<string, string> {
  if (!env) return {};
  return Object.fromEntries(Object.keys(env).map((k) => [k, "***"]));
}
