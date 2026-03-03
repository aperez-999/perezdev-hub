import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve the user's home directory. Honors $HOME so tests (and sandboxed
 * verification runs) can point inspo at a temp directory.
 */
export function home(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

/** PerezDev Hub's own config/state directory: ~/.config/perezdev */
export function inspoDir(): string {
  const base = process.env.XDG_CONFIG_HOME || join(home(), ".config");
  return join(base, "perezdev");
}

/** Path to the lockfile recording what the hub manages. */
export function lockfilePath(): string {
  return join(inspoDir(), "perezdev-lock.json");
}

/** Is LLM-assisted generation available (API key present)? */
export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
