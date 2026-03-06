import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "pdh-"));
  process.env.HOME = home;
  delete process.env.XDG_CONFIG_HOME;
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("catalog integrity", () => {
  it("every stack references real presets and MCP servers", async () => {
    const { validateCatalog } = await import("../src/registry/index.js");
    expect(validateCatalog()).toEqual([]);
  });
});

describe("standalone MCP install", () => {
  it("installs into MCP-capable tools, records the lockfile, and removes", async () => {
    const { getMcpServer } = await import("../src/registry/index.js");
    const { installMcpServer, removeMcpServer } = await import("../src/core/mcp-install.js");
    const { getMcpEntry } = await import("../src/core/lockfile.js");

    const server = getMcpServer("filesystem")!;
    const res = await installMcpServer(server, ["claude-code", "cursor", "codex"], "2026-06-13T00:00:00.000Z");

    // claude-code + cursor support MCP; codex does not.
    expect(res.installedTo.sort()).toEqual(["claude-code", "cursor"]);
    expect(res.skipped).toEqual(["codex"]);

    const settings = JSON.parse(await readFile(join(home, ".claude", "settings.json"), "utf8"));
    expect(settings.mcpServers.filesystem.command).toBe("npx");
    const cursorMcp = JSON.parse(await readFile(join(home, ".cursor", "mcp.json"), "utf8"));
    expect(cursorMcp.mcpServers.filesystem).toBeDefined();

    expect((await getMcpEntry("filesystem"))?.targets.sort()).toEqual(["claude-code", "cursor"]);

    expect(await removeMcpServer("filesystem")).toBe(true);
    const after = JSON.parse(await readFile(join(home, ".claude", "settings.json"), "utf8"));
    expect(after.mcpServers.filesystem).toBeUndefined();
    expect(await getMcpEntry("filesystem")).toBeNull();
  });

  it("re-installing with a narrower target set unions, not overwrites, recorded targets", async () => {
    const { getMcpServer } = await import("../src/registry/index.js");
    const { installMcpServer } = await import("../src/core/mcp-install.js");
    const { getMcpEntry } = await import("../src/core/lockfile.js");
    const server = getMcpServer("filesystem")!;

    await installMcpServer(server, ["claude-code", "cursor"], "2026-06-13T00:00:00.000Z");
    await installMcpServer(server, ["claude-code"], "2026-06-13T00:01:00.000Z");

    expect((await getMcpEntry("filesystem"))?.targets.sort()).toEqual(["claude-code", "cursor"]);
  });
});

describe("installStack", () => {
  it("installs all skill presets and MCP servers and records them", async () => {
    const { installStack } = await import("../src/core/stack.js");
    const { listEntries, listMcpEntries } = await import("../src/core/lockfile.js");
    const { getStack } = await import("../src/registry/index.js");

    const stack = getStack("review")!;
    const result = await installStack("review", ["claude-code"], "2026-06-13T00:00:00.000Z");

    expect(result.agents.sort()).toEqual([...stack.skillPresets].sort());
    expect(result.mcpServers.sort()).toEqual([...stack.mcpServers].sort());

    const agents = await listEntries();
    expect(agents.map((e) => e.spec.name).sort()).toEqual([...stack.skillPresets].sort());

    // A SKILL.md was written for one of the presets.
    expect(await readFile(join(home, ".claude", "skills", "code-reviewer", "SKILL.md"), "utf8")).toContain(
      "code-reviewer",
    );

    const mcp = await listMcpEntries();
    expect(mcp.map((m) => m.id).sort()).toEqual([...stack.mcpServers].sort());
  });

  it("throws on an unknown stack", async () => {
    const { installStack } = await import("../src/core/stack.js");
    await expect(installStack("nope", ["claude-code"], "2026-06-13T00:00:00.000Z")).rejects.toThrow(/unknown stack/);
  });
});
