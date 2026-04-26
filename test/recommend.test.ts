import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanProject } from "../src/core/scan.js";
import { recommend } from "../src/core/recommend.js";
import { generateSpec } from "../src/core/generate.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pdh-scan-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("scanProject", () => {
  it("detects node/ts, frameworks, db, and tests from package.json + git", async () => {
    await mkdir(join(dir, ".git"), { recursive: true });
    await writeFile(join(dir, "tsconfig.json"), "{}");
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ dependencies: { react: "18", pg: "8" }, devDependencies: { vitest: "2" } }),
    );
    const scan = await scanProject(dir);
    expect(scan.git).toBe(true);
    expect(scan.languages).toEqual(expect.arrayContaining(["node", "typescript"]));
    expect(scan.frameworks).toContain("react");
    expect(scan.databases).toContain("postgres");
    expect(scan.hasTests).toBe(true);
  });

  it("detects python + fastapi + postgres from requirements.txt", async () => {
    await writeFile(join(dir, "requirements.txt"), "fastapi==0.1\npsycopg2\npytest\n");
    const scan = await scanProject(dir);
    expect(scan.languages).toContain("python");
    expect(scan.frameworks).toContain("fastapi");
    expect(scan.databases).toContain("postgres");
    expect(scan.hasTests).toBe(true);
  });

  it("an empty dir yields no signals", async () => {
    const scan = await scanProject(dir);
    expect(scan.signals).toEqual([]);
  });
});

describe("recommend (generative)", () => {
  const scan = {
    dir,
    git: true,
    languages: ["node", "typescript"],
    frameworks: ["react"],
    databases: ["postgres"],
    hasTests: true,
    testFrameworks: ["vitest"],
    signals: [],
  };

  it("generates project-tailored agent proposals and MCP suggestions", () => {
    const recs = recommend(scan, new Set(), new Set());
    // Agent names are tailored to the framework.
    expect(recs.agents.some((a) => a.name === "react-reviewer")).toBe(true);
    expect(recs.agents.some((a) => a.name === "react-doc-writer")).toBe(true);
    expect(recs.agents.some((a) => a.name === "commit-helper")).toBe(true);
    // Descriptions weave in the stack — not canned.
    expect(recs.agents.find((a) => a.name === "react-reviewer")?.description).toMatch(/react/);
    // MCP suggestions are concrete servers.
    expect(recs.mcp.some((m) => m.server.id === "postgres")).toBe(true);
    expect(recs.mcp.some((m) => m.server.id === "git")).toBe(true);
    // Every item has a reason; lists are ranked.
    expect(recs.agents.every((a) => a.reason.length > 0)).toBe(true);
    for (let i = 1; i < recs.agents.length; i++) {
      expect(recs.agents[i - 1]!.score).toBeGreaterThanOrEqual(recs.agents[i]!.score);
    }
  });

  it("a proposal turns into a valid AgentSpec", () => {
    const proposal = recommend(scan, new Set(), new Set()).agents[0]!;
    const spec = generateSpec({
      name: proposal.name,
      role: proposal.role,
      description: proposal.description,
      behaviors: [],
      allowedTools: proposal.allowedTools,
      mcpDependencies: [],
      targets: ["claude-code"],
    });
    expect(spec.name).toBe(proposal.name);
    expect(spec.instructions.length).toBeGreaterThan(0);
  });

  it("filters out already-installed agents and MCP servers", () => {
    const recs = recommend(scan, new Set(["react-reviewer"]), new Set(["postgres"]));
    expect(recs.agents.some((a) => a.name === "react-reviewer")).toBe(false);
    expect(recs.mcp.some((m) => m.server.id === "postgres")).toBe(false);
  });
});
