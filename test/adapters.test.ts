import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAgentSpec, type AgentSpec } from "../src/core/agent-spec.js";

function spec(overrides: Partial<AgentSpec> = {}): AgentSpec {
  return parseAgentSpec({
    name: "code-reviewer",
    description: "use when reviewing pull requests",
    role: "a senior code reviewer",
    instructions: "Review code carefully.",
    allowedTools: ["Read", "Grep"],
    targets: ["claude-code"],
    ...overrides,
  });
}

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "inspo-home-"));
  process.env.HOME = home;
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("ClaudeCodeAdapter", () => {
  it("writes a SKILL.md, lists it, and removes it", async () => {
    const { ClaudeCodeAdapter } = await import("../src/adapters/claude-code.js");
    const a = new ClaudeCodeAdapter();
    const s = spec();

    const written = await a.write(s);
    const skillPath = join(home, ".claude", "skills", "code-reviewer", "SKILL.md");
    expect(written.map((f) => f.path)).toContain(skillPath);

    const content = await readFile(skillPath, "utf8");
    expect(content).toContain("name: code-reviewer");
    expect(content).toContain("x-perezdev: true");
    expect(content).toContain("Review code carefully.");

    const listed = await a.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.name).toBe("code-reviewer");
    expect(listed[0]!.tool).toBe("claude-code");

    expect(await a.remove(s)).toBe(true);
    expect(await a.list()).toHaveLength(0);
  });

  it("merges MCP dependencies into settings.json and prunes on remove", async () => {
    const { ClaudeCodeAdapter } = await import("../src/adapters/claude-code.js");
    const a = new ClaudeCodeAdapter();
    const s = spec({
      mcpDependencies: [{ name: "filesystem", command: "npx", args: ["-y", "srv"], env: {} }],
    });

    await a.write(s);
    const settingsPath = join(home, ".claude", "settings.json");
    const settings = JSON.parse(await readFile(settingsPath, "utf8"));
    expect(settings.mcpServers.filesystem.command).toBe("npx");

    await a.remove(s);
    const after = JSON.parse(await readFile(settingsPath, "utf8"));
    expect(after.mcpServers.filesystem).toBeUndefined();
  });

  it("does not list skills it doesn't own", async () => {
    const { ClaudeCodeAdapter } = await import("../src/adapters/claude-code.js");
    const a = new ClaudeCodeAdapter();
    const dir = join(home, ".claude", "skills", "foreign");
    await mkdir(dir, { recursive: true });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(dir, "SKILL.md"), "---\nname: foreign\n---\nnot ours\n");
    expect(await a.list()).toHaveLength(0);
  });
});

describe("frontmatter (dependency-free)", () => {
  it("round-trips a tricky description and emits valid, quoted YAML", async () => {
    const { buildSkillMarkdown, isOwned, readVersion } = await import("../src/adapters/shared.js");
    const md = buildSkillMarkdown(
      spec({ description: "use when CI fails: tracebacks, errors & flaky tests", version: "1.2.3" }),
    );
    // free-text scalars with YAML-significant chars are quoted, not broken across lines
    expect(md).toMatch(/description: ".*CI fails: tracebacks, errors & flaky tests\."/);
    expect(md).toMatch(/^---\nname: code-reviewer/);
    expect(isOwned(md)).toBe(true);
    expect(readVersion(md)).toBe("1.2.3");
  });
  it("still recognizes files stamped with the legacy x-inspo marker", async () => {
    const { isOwned } = await import("../src/adapters/shared.js");
    expect(isOwned("---\nname: old\nx-inspo: true\n---\nbody")).toBe(true);
    expect(isOwned("---\nname: foreign\n---\nbody")).toBe(false);
  });
});

describe("CursorAdapter", () => {
  it("writes a .mdc rule and lists it", async () => {
    const { CursorAdapter } = await import("../src/adapters/cursor.js");
    const a = new CursorAdapter();
    const s = spec({ targets: ["cursor"] });
    await a.write(s);
    const rulePath = join(home, ".cursor", "rules", "code-reviewer.mdc");
    expect(await readFile(rulePath, "utf8")).toContain("x-perezdev: true");
    const listed = await a.list();
    expect(listed[0]!.tool).toBe("cursor");
  });
});

describe("CodexAdapter (flat markdown)", () => {
  it("writes a prompt file and removes it", async () => {
    const { CodexAdapter } = await import("../src/adapters/codex.js");
    const a = new CodexAdapter();
    const s = spec({ targets: ["codex"] });
    await a.write(s);
    const f = join(home, ".codex", "prompts", "code-reviewer.md");
    expect(await readFile(f, "utf8")).toContain("x-perezdev: true");
    expect(await a.list()).toHaveLength(1);
    expect(await a.remove(s)).toBe(true);
    expect(await a.list()).toHaveLength(0);
  });
});

describe("ClineAdapter (flat markdown)", () => {
  it("writes a rule file under ~/.clinerules and removes it", async () => {
    const { ClineAdapter } = await import("../src/adapters/cline.js");
    const a = new ClineAdapter();
    const s = spec({ targets: ["cline"] });
    await a.write(s);
    const f = join(home, ".clinerules", "code-reviewer.md");
    expect(await readFile(f, "utf8")).toContain("x-perezdev: true");
    expect(await a.list()).toHaveLength(1);
    expect(await a.remove(s)).toBe(true);
    expect(await a.list()).toHaveLength(0);
  });
});

describe("registry detection", () => {
  it("detects a tool only when its root dir exists", async () => {
    const { detectAll } = await import("../src/adapters/registry.js");
    const before = await detectAll();
    expect(before.every((d) => !d.detection.installed)).toBe(true);

    await mkdir(join(home, ".claude"), { recursive: true });
    const after = await detectAll();
    const cc = after.find((d) => d.adapter.id === "claude-code");
    expect(cc!.detection.installed).toBe(true);
  });
});
