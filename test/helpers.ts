import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { generateSpec } from "../src/core/generate.js";
import type { AgentSpec, McpDependency, ToolId } from "../src/core/agent-spec.js";
import { projectScope, userScope, type Scope } from "../src/core/scope.js";

export interface Sandbox {
  home: string;
  repo: string;
  project: Scope;
  user: () => Scope;
}

/**
 * A throwaway $HOME and git repo per test. Detection env vars are cleared so a
 * developer running the suite inside Cursor gets the same results as CI.
 */
export function useSandbox(): Sandbox {
  const box = {} as Sandbox;
  let base: string;
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "perezdev-"));
    box.home = join(base, "home");
    box.repo = join(base, "repo");
    await mkdir(box.home);
    await mkdir(join(box.repo, ".git"), { recursive: true });
    process.env.HOME = box.home;
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.CURSOR_TRACE_ID;
    delete process.env.CURSOR_AGENT;
    delete process.env.TERM_PROGRAM;
    box.project = projectScope(box.repo);
    box.user = userScope;
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  return box;
}

export function spec(name: string, targets: ToolId[], mcpDependencies: McpDependency[] = []): AgentSpec {
  return generateSpec({
    name,
    role: `a ${name.replace(/-/g, " ")}`,
    description: `handle ${name.replace(/-/g, " ")} work`,
    behaviors: [],
    allowedTools: [],
    mcpDependencies,
    targets,
  });
}

export const dep = (name: string, args: string[] = ["-y", `@example/${name}`]): McpDependency => ({
  name,
  command: "npx",
  args,
  env: {},
});
