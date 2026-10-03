import pc from "picocolors";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveScope, type ScopeOptions } from "../core/scope.js";
import { version } from "../core/version.js";
import { atomicWrite, exists } from "../util/fs-safe.js";
import { p, intro } from "../ui/prompts.js";

export const WORKFLOW_PATH = ".github/workflows/perezdev.yml";

export interface CiOptions extends ScopeOptions {
  force?: boolean;
  dryRun?: boolean;
}

/** The repo's default branch from origin/HEAD, else "main". */
async function defaultBranch(root: string): Promise<string> {
  try {
    const { stdout } = await promisify(execFile)("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { cwd: root });
    return stdout.trim().replace(/^origin\//, "") || "main";
  } catch {
    return "main";
  }
}

/** Pinned to this minor version, so a new perezdev release can't change CI results without a PR. */
export function workflow(branch: string): string {
  const [major, minor] = version.split(".");
  return `# Fails when the AI agent setup that perezdev generated (skills, rules, MCP
# configs, the AGENTS.md section) no longer matches perezdev.lock.json.
# Fix locally with \`npx perezdev-hub doctor --fix\` (or \`sync\`) and commit the result.
name: agents

on:
  pull_request:
  push:
    branches: [${branch}]

permissions:
  contents: read

jobs:
  doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx -y perezdev-hub@~${major}.${minor} doctor
`;
}

export async function workflowFor(root: string): Promise<string> {
  return workflow(await defaultBranch(root));
}

/** Add a GitHub Actions workflow that runs `perezdev doctor` on pull requests. */
export async function runCi(opts: CiOptions = {}): Promise<void> {
  const scope = await resolveScope(opts);
  if (scope.kind !== "project") {
    console.error(pc.red("perezdev ci sets up a repository's CI — run it inside one."));
    process.exit(1);
  }
  intro("ci", scope);
  const path = join(scope.root, WORKFLOW_PATH);
  if ((await exists(path)) && !opts.force) {
    p.cancel(`${WORKFLOW_PATH} already exists. Re-run with --force to replace it.`);
    process.exit(1);
  }
  const contents = await workflowFor(scope.root);
  if (opts.dryRun) {
    p.note(contents.trimEnd(), WORKFLOW_PATH);
    p.outro(pc.dim("dry run — nothing written."));
    return;
  }
  await atomicWrite(path, contents);
  p.log.step(`created ${WORKFLOW_PATH}`);
  p.outro(`${pc.green("✓")} Commit it — pull requests now fail when generated agent files drift. ${pc.dim("Other CI: run `npx -y perezdev-hub doctor`.")}`);
}
