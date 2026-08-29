import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTargetCsv, resolveTargets } from "../src/core/targets.js";
import { loadRc } from "../src/core/rc.js";
import { resolveProvider } from "../src/core/provider.js";
import { installSpec } from "../src/core/install.js";
import { installMcpServer } from "../src/core/mcp-install.js";
import { parseAgentSpec } from "../src/core/agent-spec.js";
import { readIfExists } from "../src/util/fs-safe.js";
import { lockfilePath } from "../src/core/config.js";
import { getMcpServer } from "../src/registry/index.js";
import { runCreate } from "../src/commands/create.js";
import { runDoctor } from "../src/commands/doctor.js";
import { runShow } from "../src/commands/show.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "pdh-p1-"));
  process.env.HOME = home;
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  vi.restoreAllMocks();
});

/** Capture everything console.log prints during `fn`. */
async function captureLog(fn: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void lines.push(a.join(" ")));
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return lines.join("\n");
}

const SPEC = parseAgentSpec({
  name: "code-reviewer",
  description: "review code for bugs",
  role: "a reviewer",
  instructions: "Review carefully.",
  targets: ["claude-code"],
  source: "generated",
});

describe("target resolution", () => {
  it("parses a CSV, dropping unknown ids", () => {
    expect(parseTargetCsv("claude-code, nope, cursor")).toEqual(["claude-code", "cursor"]);
    expect(parseTargetCsv("")).toBeUndefined();
  });

  it("prefers the flag over everything", async () => {
    await writeFile(join(home, ".perezdevrc"), JSON.stringify({ default_targets: ["cursor"] }), "utf8");
    expect(await resolveTargets("claude-code")).toEqual({ targets: ["claude-code"], source: "flag" });
  });

  it("falls back to .perezdevrc default_targets when no flag", async () => {
    await writeFile(join(home, ".perezdevrc"), JSON.stringify({ default_targets: ["claude-code", "cursor"] }), "utf8");
    expect(await resolveTargets()).toEqual({ targets: ["claude-code", "cursor"], source: "rc" });
  });

  it("loadRc keeps only valid targets and providers", async () => {
    await writeFile(
      join(home, ".perezdevrc"),
      JSON.stringify({ default_targets: ["claude-code", "bogus"], default_provider: "cloud" }),
      "utf8",
    );
    const rc = await loadRc();
    expect(rc.default_targets).toEqual(["claude-code"]);
    expect(rc.default_provider).toBe("cloud");
  });
});

describe("provider preference", () => {
  const up = { available: true, models: ["qwen"], normal: "qwen", thinking: "qwen" };
  it("defaults to local when Ollama is up", () => {
    process.env.ANTHROPIC_API_KEY = "x";
    expect(resolveProvider(up).kind).toBe("local");
  });
  it("prefers cloud when asked, even with Ollama up", () => {
    process.env.ANTHROPIC_API_KEY = "x";
    const p = resolveProvider(up, "normal", "cloud");
    expect(p.kind).toBe("cloud");
  });
  it("prefer cloud still falls back to local when no key", () => {
    expect(resolveProvider(up, "normal", "cloud").kind).toBe("local");
  });
});

describe("create --dry-run", () => {
  it("writes nothing and records no lockfile", async () => {
    await captureLog(() =>
      runCreate({ name: "dry-agent", purpose: "do a dry run thing", target: "claude-code", dryRun: true }),
    );
    expect(await readIfExists(lockfilePath())).toBeNull();
    expect(await readIfExists(join(home, ".claude", "skills", "dry-agent", "SKILL.md"))).toBeNull();
  });
});

describe("doctor --fix", () => {
  it("repairs an agent file deleted out-of-band", async () => {
    await installSpec(SPEC, new Date().toISOString());
    const skill = join(home, ".claude", "skills", "code-reviewer", "SKILL.md");
    await unlink(skill);

    const out = await captureLog(() => runDoctor({ fix: true, json: true }));
    const report = JSON.parse(out);
    expect(report.repaired).toBeGreaterThanOrEqual(1);
    expect(report.ok).toBe(true);
    expect((await readFile(skill, "utf8")).length).toBeGreaterThan(0);
  });
});

describe("--json output", () => {
  it("show --json emits an agent object with file presence", async () => {
    await installSpec(SPEC, new Date().toISOString());
    const out = await captureLog(() => runShow("code-reviewer", { json: true }));
    const obj = JSON.parse(out);
    expect(obj.kind).toBe("agent");
    expect(obj.name).toBe("code-reviewer");
    expect(obj.files.some((f: { present: boolean }) => f.present)).toBe(true);
  });

  it("show --json falls back to an MCP server", async () => {
    await installMcpServer(getMcpServer("filesystem")!, ["claude-code"], new Date().toISOString());
    const out = await captureLog(() => runShow("filesystem", { json: true }));
    const obj = JSON.parse(out);
    expect(obj.kind).toBe("mcp");
    expect(obj.id).toBe("filesystem");
  });
});
