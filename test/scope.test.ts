import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lockfilePath, resolveScope } from "../src/core/scope.js";
import { parseTargetCsv, resolveTargets } from "../src/core/targets.js";
import { useSandbox } from "./helpers.js";

const box = useSandbox();

describe("scope resolution", () => {
  it("uses the enclosing repository, even from a subdirectory", async () => {
    const sub = join(box.repo, "packages/api");
    await mkdir(sub, { recursive: true });
    expect(await resolveScope({}, sub)).toEqual({ kind: "project", root: box.repo });
    expect(lockfilePath(await resolveScope({}, sub))).toBe(join(box.repo, "perezdev.lock.json"));
  });

  it("uses the home directory with --global or outside a repository", async () => {
    expect((await resolveScope({ global: true }, box.repo)).kind).toBe("user");
    expect((await resolveScope({}, box.home)).kind).toBe("user");
  });

  it("never treats a version-controlled home directory as a project", async () => {
    await mkdir(join(box.home, ".git"));
    expect((await resolveScope({}, box.home)).kind).toBe("user");
  });
});

describe("target resolution", () => {
  it("rejects unknown tool ids instead of dropping them", () => {
    expect(parseTargetCsv("claude-code, cursor")).toEqual(["claude-code", "cursor"]);
    expect(() => parseTargetCsv("claude-code,vim")).toThrow(/unknown tool\(s\): vim/);
  });

  it("prefers the tools a project already uses", async () => {
    await mkdir(join(box.repo, ".cursor"));
    await writeFile(join(box.repo, "CLAUDE.md"), "# notes\n");
    expect(await resolveTargets(box.project)).toEqual({ targets: ["claude-code", "cursor"], source: "detected" });
  });

  it("falls back to tools installed on this machine for a fresh repo", async () => {
    await mkdir(join(box.home, ".codex"));
    expect(await resolveTargets(box.project)).toEqual({ targets: ["codex"], source: "detected" });
  });

  it("honors default_targets from ~/.perezdevrc", async () => {
    await writeFile(join(box.home, ".perezdevrc"), JSON.stringify({ default_targets: ["roo", "nope"] }));
    expect(await resolveTargets(box.project)).toEqual({ targets: ["roo"], source: "rc" });
  });

  it("detects editor extensions at user scope", async () => {
    await mkdir(join(box.home, ".vscode/extensions/saoudrizwan.claude-dev-3.20.0"), { recursive: true });
    expect((await resolveTargets(box.user())).targets).toEqual(["cline"]);
  });
});
