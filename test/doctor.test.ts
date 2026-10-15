import { describe, expect, it } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { diagnose, doctorAdvice, doctorExitCode, repair, summarize } from "../src/core/doctor.js";
import { commit } from "../src/core/install.js";
import { dep, spec, useSandbox } from "./helpers.js";

const box = useSandbox();
const skillPath = () => join(box.repo, ".claude/skills/reviewer/SKILL.md");

describe("doctor", () => {
  it("reports healthy right after install", async () => {
    await commit(box.project, { agents: [spec("reviewer", ["claude-code", "cursor"])] });
    const items = await diagnose(box.project);
    expect(items.map((i) => [i.target, i.status])).toEqual([
      ["claude-code", "ok"],
      ["cursor", "ok"],
    ]);
    expect(doctorExitCode(summarize(items))).toBe(0);
  });

  it("flags a deleted file as missing and a hand-edited one as modified", async () => {
    await commit(box.project, { agents: [spec("reviewer", ["claude-code", "roo"])] });
    await rm(skillPath());
    const rule = join(box.repo, ".roo/rules/reviewer.md");
    await writeFile(rule, (await readFile(rule, "utf8")) + "\nextra line\n");

    const items = await diagnose(box.project);
    expect(Object.fromEntries(items.map((i) => [i.target, i.status]))).toEqual({ "claude-code": "missing", roo: "modified" });
    expect(items.find((i) => i.target === "roo")!.path).toBe(rule);
    const report = summarize(items);
    expect(doctorExitCode(report)).toBe(1);
    expect(doctorAdvice(items)).toBe("1 missing, 1 modified — repair with perezdev doctor --fix");
  });

  it("--fix rewrites drifted files from the lockfile", async () => {
    await commit(box.project, { agents: [spec("reviewer", ["claude-code"])] });
    const original = await readFile(skillPath(), "utf8");
    await writeFile(skillPath(), original.replace("# Reviewer", "# Something else"));

    expect(await repair(box.project, await diagnose(box.project))).toBe(1);
    expect(await readFile(skillPath(), "utf8")).toBe(original);
    expect(summarize(await diagnose(box.project)).ok).toBe(true);
  });

  it("checks MCP entries match what the lockfile launches", async () => {
    await commit(box.project, { agents: [spec("reviewer", ["claude-code"], [dep("docs")])] });
    const mcp = join(box.repo, ".mcp.json");
    const json = JSON.parse(await readFile(mcp, "utf8"));
    json.mcpServers.docs.args = ["-y", "@example/something-else"];
    await writeFile(mcp, JSON.stringify(json));
    expect((await diagnose(box.project))[0]!.status).toBe("modified");
  });

  it("treats a CRLF checkout (Git for Windows) as unchanged", async () => {
    await commit(box.project, { agents: [spec("reviewer", ["claude-code"])] });
    await writeFile(skillPath(), (await readFile(skillPath(), "utf8")).replace(/\n/g, "\r\n"));
    expect((await diagnose(box.project))[0]!.status).toBe("ok");
  });

  it("tolerates keys a tool adds to its own MCP entries", async () => {
    await commit(box.project, { agents: [spec("reviewer", ["claude-code"], [dep("docs")])] });
    const mcp = join(box.repo, ".mcp.json");
    const json = JSON.parse(await readFile(mcp, "utf8"));
    json.mcpServers.docs.type = "stdio";
    await writeFile(mcp, JSON.stringify(json));
    expect((await diagnose(box.project))[0]!.status).toBe("ok");
  });

  it("separates tools that aren't installed from real drift at user scope", async () => {
    await mkdir(join(box.home, ".claude"));
    await commit(box.user(), { agents: [spec("reviewer", ["claude-code", "roo"])] });
    await rm(join(box.home, ".roo"), { recursive: true });

    const items = await diagnose(box.user());
    expect(items.find((i) => i.target === "roo")!.status).toBe("tool-absent");
    const report = summarize(items);
    expect(doctorExitCode(report)).toBe(0);
    expect(doctorExitCode(report, true)).toBe(1);
  });
});
