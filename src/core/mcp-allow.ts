/**
 * Launchers an MCP config may use. Anything else (bash, curl, absolute paths)
 * is refused, so an imported profile or spec can't smuggle in arbitrary code.
 */
const ALLOWED_BINS = new Set(["npx", "uvx", "docker", "node"]);

/** Per-launcher flags that would run inline code or escape the sandbox they imply. */
const FORBIDDEN_FLAGS: Record<string, string[]> = {
  node: ["-e", "--eval", "-p", "--print", "-r", "--require", "--import", "--loader"],
  npx: ["-c", "--call", "-g", "--global", "--prefix"],
  uvx: ["--python-preference"],
  docker: ["--privileged", "--cap-add", "--pid", "--ipc", "--network=host", "--net=host", "--userns", "--device", "-v", "--volume", "--mount"],
};

/** Shell / remote-fetch patterns that have no place in an MCP argv. */
const UNSAFE_ARG = /[;&|`$(){}<>]|^(https?:|git\+)/i;

function forbidden(bin: string, arg: string): boolean {
  return (FORBIDDEN_FLAGS[bin] ?? []).some((flag) => arg === flag || arg.startsWith(`${flag}=`));
}

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
    if (forbidden(bin, arg)) return `refused: '${arg}' is not allowed for ${bin}`;
    if (UNSAFE_ARG.test(arg) || arg.includes("://")) return `refused: unsafe MCP argument '${arg}'`;
  }
  return null;
}

/** Throw when `command`/`args` would launch something outside the MCP allowlist. */
export function assertSafeMcpLaunch(command: string, args: string[] = []): void {
  const err = mcpLaunchError(command, args);
  if (err) throw new Error(err);
}

/** Keep env keys, replace values — for `show --json` (the lockfile itself is unchanged). */
export function redactEnv(env: Record<string, string> | undefined): Record<string, string> {
  if (!env) return {};
  return Object.fromEntries(Object.keys(env).map((k) => [k, "***"]));
}
