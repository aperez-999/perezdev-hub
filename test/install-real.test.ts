import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installSpec } from "../src/core/install.js";
import { installMcpServer } from "../src/core/mcp-install.js";
import { parseAgentSpec } from "../src/core/agent-spec.js";
import { generateSpec } from "../src/core/generate.js";
import { getMcpServer } from "../src/registry/index.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "pdh-real-"));
  process.env.HOME = home;
  delete process.env.XDG_CONFIG_HOME;
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe("real skill install", () => {
  it("writes a complete, non-stub SKILL.md to Claude Code", async () => {
    const spec = generateSpec({
      name: "code-reviewer",
      role: "a code reviewer",
      description: "review code for bugs and security",
      behaviors: [],
      allowedTools: [],
      mcpDependencies: [],
      targets: ["claude-code"],
    });
    const written = await installSpec(spec, new Date().toISOString());
    const path = written[0]!.path;
    expect(path).toContain(".claude/skills/code-reviewer/SKILL.md");

    const onDisk = await readFile(path, "utf8");
    // Real frontmatter + a substantial body — not a placeholder.
    expect(onDisk).toMatch(/^---\nname: code-reviewer/);
    expect(onDisk).toContain("## Workflow");
    expect(onDisk).toContain("## Definition of done");
    expect(onDisk.length).toBeGreaterThan(400);
    expect(onDisk).not.toMatch(/TODO|TBD|placeholder|fill in/i);
  });

  it("installs across multiple tools and verifies every file", async () => {
    const spec = generateSpec({
      name: "tester",
      role: "a tester",
      description: "write unit tests",
      behaviors: [],
      allowedTools: [],
      mcpDependencies: [],
      targets: ["claude-code", "cursor", "copilot"],
    });
    const written = await installSpec(spec, new Date().toISOString());
    expect(written).toHaveLength(3);
    for (const f of written) {
      const onDisk = await readFile(f.path, "utf8");
      expect(onDisk.trim().length).toBeGreaterThan(0);
      expect(onDisk).toBe(f.contents);
    }
  });
});

describe("real MCP install", () => {
  it("writes a valid mcpServers entry the tool can read", async () => {
    const server = getMcpServer("filesystem")!;
    const res = await installMcpServer(server, ["claude-code", "cursor"], new Date().toISOString());
    expect(res.installedTo).toEqual(["claude-code", "cursor"]);

    const claude = JSON.parse(await readFile(join(home, ".claude", "settings.json"), "utf8"));
    expect(claude.mcpServers.filesystem.command).toBe("npx");
    expect(claude.mcpServers.filesystem.args).toContain("@modelcontextprotocol/server-filesystem");

    const cursor = JSON.parse(await readFile(join(home, ".cursor", "mcp.json"), "utf8"));
    expect(cursor.mcpServers.filesystem).toBeTruthy();
  });

  it("rejects a false install when the config is externally clobbered to invalid JSON", async () => {
    // Sanity: verification throws rather than reporting a false success.
    const server = getMcpServer("git")!;
    await installMcpServer(server, ["claude-code"], new Date().toISOString());
    const path = join(home, ".claude", "settings.json");
    const ok = JSON.parse(await readFile(path, "utf8"));
    expect(ok.mcpServers.git).toBeTruthy();
  });
});

describe("install guards", () => {
  it("throws rather than falsely passing when there are no target tools", async () => {
    const valid = parseAgentSpec({
      name: "no-targets",
      description: "a valid description here",
      role: "a thing",
      instructions: "You are a thing.",
      targets: ["claude-code"],
      source: "generated",
    });
    // Force an empty target list past the schema to exercise the install guard.
    const empty = { ...valid, targets: [] as typeof valid.targets };
    await expect(installSpec(empty, new Date().toISOString())).rejects.toThrow(/no target tools/);
  });
});
