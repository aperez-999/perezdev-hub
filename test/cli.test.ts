import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { useSandbox } from "./helpers.js";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const tsx = join(root, "node_modules/.bin/tsx");
const box = useSandbox();

/** Run the real CLI the way CI would: non-interactive, isolated HOME, inside the sandbox repo. */
async function cli(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(tsx, [join(root, "src/index.ts"), ...args], {
      cwd: box.repo,
      env: { ...process.env, HOME: box.home, CI: "1", NO_COLOR: "1" },
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code: number; stdout: string; stderr: string };
    return { code: e.code, stdout: e.stdout, stderr: e.stderr };
  }
}

describe("perezdev CLI", () => {
  it("installs a preset into the repo and passes doctor", { timeout: 30_000 }, async () => {
    const created = await cli("create", "--preset", "code-reviewer", "-t", "claude-code,cursor");
    expect(created.code).toBe(0);
    expect(await readFile(join(box.repo, ".claude/skills/code-reviewer/SKILL.md"), "utf8")).toMatch(/^---\nname: code-reviewer/);

    const listed = JSON.parse((await cli("list", "--json")).stdout);
    expect(listed.scope).toBe("project");
    expect(listed.agents.map((a: { name: string }) => a.name)).toEqual(["code-reviewer"]);

    const doctor = await cli("doctor", "--json");
    expect(doctor.code).toBe(0);
    expect(JSON.parse(doctor.stdout).ok).toBe(true);
  });

  it("fails doctor in CI when a generated file is edited by hand", { timeout: 30_000 }, async () => {
    await cli("create", "--preset", "debugger", "-t", "claude-code");
    const skill = join(box.repo, ".claude/skills/debugger/SKILL.md");
    await writeFile(skill, (await readFile(skill, "utf8")) + "\nlocal tweak\n");

    const doctor = await cli("doctor");
    expect(doctor.code).toBe(1);
    expect(doctor.stdout).toContain("modified");

    expect((await cli("doctor", "--fix")).code).toBe(0);
    expect(await readFile(skill, "utf8")).not.toContain("local tweak");
  });

  it("explains what's missing when run non-interactively without enough flags", { timeout: 30_000 }, async () => {
    const res = await cli("create");
    expect(res.code).toBe(1);
    expect(res.stdout + res.stderr).toContain("--purpose");
  });
});

describe("perezdev add + agents-md", () => {
  it("adds a skill from a local folder and keeps AGENTS.md commands current", { timeout: 30_000 }, async () => {
    const dir = join(box.repo, "skills/release-check");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SKILL.md"), "---\nname: release-check\ndescription: Use before tagging a release.\n---\nCheck the changelog.\n");
    await writeFile(join(box.repo, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));

    const listed = await cli("add", "./skills", "--list");
    expect(listed.stdout).toContain("release-check");
    expect((await cli("add", "./skills", "-t", "claude-code")).code).toBe(0);
    expect((await cli("agents-md")).code).toBe(0);
    expect(await readFile(join(box.repo, "AGENTS.md"), "utf8")).toContain("- Test: `npm test`");
    expect((await cli("doctor")).code).toBe(0);
  });
});
