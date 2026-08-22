import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanEcosystem } from "../src/core/ecosystem.js";
import { loadRc, saveRc, rcPath } from "../src/core/rc.js";
import { scanProject } from "../src/core/scan.js";

let dir: string;
let h: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "eco-"));
  h = await mkdtemp(join(tmpdir(), "ecohome-"));
  process.env.HOME = h;
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.CURSOR_TRACE_ID;
  delete process.env.CURSOR_AGENT;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(h, { recursive: true, force: true });
});

const get = (eco: { id: string; present: boolean }[], id: string) => eco.find((t) => t.id === id)!;

describe("scanEcosystem", () => {
  it("marks tools present from their workspace config footprint", async () => {
    await writeFile(join(dir, ".cursorrules"), "x");
    await writeFile(join(dir, ".clinerules"), "x");
    await writeFile(join(dir, ".windsurfrules"), "x");
    await mkdir(join(dir, ".github"), { recursive: true });
    await writeFile(join(dir, ".github", "copilot-instructions.md"), "x");
    const eco = await scanEcosystem(dir, h);
    expect(get(eco, "cursor").present).toBe(true);
    expect(get(eco, "cline").present).toBe(true);
    expect(get(eco, "windsurf").present).toBe(true);
    expect(get(eco, "copilot").present).toBe(true);
    expect(get(eco, "aider").present).toBe(false);
  });

  it("detects global CLI tools from the home directory", async () => {
    await mkdir(join(h, ".claude"), { recursive: true });
    await writeFile(join(h, ".claude", "settings.json"), "{}");
    const eco = await scanEcosystem(dir, h);
    expect(get(eco, "claude-code").present).toBe(true);
    expect(get(eco, "cursor").present).toBe(false);
  });

  it("marks cursor present when running inside the Cursor host", async () => {
    process.env.CURSOR_TRACE_ID = "1";
    const eco = await scanEcosystem(dir, h);
    expect(get(eco, "cursor").present).toBe(true);
    delete process.env.CURSOR_TRACE_ID;
  });
});

describe("scanProject stack detection", () => {
  it("names test frameworks and tags redis", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ dependencies: { react: "18", ioredis: "5" }, devDependencies: { vitest: "1", typescript: "5" } }),
    );
    const scan = await scanProject(dir);
    expect(scan.frameworks).toContain("react");
    expect(scan.databases).toContain("redis");
    expect(scan.testFrameworks).toContain("vitest");
    expect(scan.languages).toContain("typescript");
    expect(scan.signals).toContain("vitest");
  });

  it("detects a Ruby/Rails project from the Gemfile", async () => {
    await writeFile(join(dir, "Gemfile"), 'gem "rails"\ngem "pg"\ngem "rspec"\n');
    const scan = await scanProject(dir);
    expect(scan.languages).toContain("ruby");
    expect(scan.frameworks).toContain("rails");
    expect(scan.databases).toContain("postgres");
    expect(scan.testFrameworks).toContain("rspec");
  });
});

describe("perezdevrc cache", () => {
  it("returns defaults when no file exists", async () => {
    const rc = await loadRc();
    expect(rc).toEqual({ last_active_tab: 1, autonomy_mode: "manual", mcp_ignored_servers: [] });
  });

  it("round-trips saved preferences atomically", async () => {
    await saveRc({ last_active_tab: 3, autonomy_mode: "auto", mcp_ignored_servers: ["postgres"] });
    const rc = await loadRc();
    expect(rc.last_active_tab).toBe(3);
    expect(rc.autonomy_mode).toBe("auto");
    expect(rc.mcp_ignored_servers).toEqual(["postgres"]);
    expect(rcPath()).toContain(".perezdevrc");
  });

  it("falls back to defaults on a corrupt file", async () => {
    await writeFile(rcPath(), "{ not json");
    const rc = await loadRc();
    expect(rc.last_active_tab).toBe(1);
    expect(rc.autonomy_mode).toBe("manual");
  });
});
