import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { workflow } from "../src/commands/ci.js";
import { diagnose } from "../src/core/doctor.js";
import { commit, toStandalone } from "../src/core/install.js";
import { readLock } from "../src/core/lockfile.js";
import { managedPaths, onPath, readiness } from "../src/core/readiness.js";
import { getMcpServer } from "../src/registry/index.js";
import { exists } from "../src/util/fs-safe.js";
import { spec, useSandbox } from "./helpers.js";

const box = useSandbox();

async function realGitRepo(): Promise<void> {
  await rm(join(box.repo, ".git"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: box.repo });
}

describe("readiness", () => {
  it("lists every file to commit, including the lockfile and CI workflow", async () => {
    await commit(box.project, { agents: [spec("reviewer", ["claude-code"])], mcp: [toStandalone(getMcpServer("context7")!, ["claude-code"])] });
    expect(managedPaths(box.project, await readLock(box.project))).toEqual([
      ".claude/skills/reviewer/SKILL.md",
      ".github/workflows/perezdev.yml",
      ".mcp.json",
      "perezdev.lock.json",
    ]);
  });

  it("reports missing launchers and unset secrets for the servers that need them", async () => {
    const path = process.env.PATH;
    const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    try {
      process.env.PATH = join(box.home, "empty-bin");
      delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      expect(await onPath("node")).toBe(false);
      const lock = (await commit(box.project, { mcp: [toStandalone(getMcpServer("github")!, ["claude-code"])] })).next;
      const state = await readiness(box.project, lock);
      expect(state.missingLaunchers).toEqual([{ bin: "docker", servers: ["github"] }]);
      expect(state.missingEnv).toEqual([{ name: "GITHUB_PERSONAL_ACCESS_TOKEN", servers: ["github"] }]);
    } finally {
      process.env.PATH = path;
      if (token !== undefined) process.env.GITHUB_PERSONAL_ACCESS_TOKEN = token;
    }
  });

  it("asks git which generated files are uncommitted or ignored, and notices a CI check", async () => {
    await realGitRepo();
    await writeFile(join(box.repo, ".gitignore"), ".claude/\n");
    await commit(box.project, { agents: [spec("reviewer", ["claude-code", "codex"])] });
    let state = await readiness(box.project, await readLock(box.project));
    expect(state.ignored).toEqual([".claude/"]); // git reports an ignored directory as a whole
    expect(state.uncommitted).toEqual([".agents/skills/reviewer/SKILL.md", "perezdev.lock.json"]);
    expect(state.ci).toBe(false);

    await mkdir(join(box.repo, ".github/workflows"), { recursive: true });
    await writeFile(join(box.repo, ".github/workflows/perezdev.yml"), workflow("main"));
    state = await readiness(box.project, await readLock(box.project));
    expect(state.ci).toBe(true);
  });
});

describe("CI workflow", () => {
  it("runs doctor on pull requests with perezdev pinned to the current minor", () => {
    const yml = workflow("trunk");
    expect(yml).toContain("branches: [trunk]");
    expect(yml).toMatch(/npx -y perezdev-hub@~\d+\.\d+ doctor/);
    expect(yml).toContain("permissions:\n  contents: read");
  });
});

describe("CLAUDE.md import", () => {
  it("is created when Claude Code is installed, but CI judges it only by what's in the repo", async () => {
    await writeFile(join(box.repo, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
    await mkdir(join(box.home, ".claude"));
    await commit(box.project, { agentsMd: true });
    expect(await exists(join(box.repo, "CLAUDE.md"))).toBe(true);

    // A CI runner: no Claude Code installed, and CLAUDE.md not checked in.
    await rm(join(box.home, ".claude"), { recursive: true });
    await rm(join(box.repo, "CLAUDE.md"));
    const items = await diagnose(box.project);
    expect(items.map((i) => [i.name, i.status])).toEqual([["AGENTS.md", "ok"]]);
  });
});
