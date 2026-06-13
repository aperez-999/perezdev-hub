import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeParseAgentSpec, parseAgentSpec } from "../src/core/agent-spec.js";
import { templateInstructions, generateSpec, type GenerateInput } from "../src/core/generate.js";
import { atomicWrite, backup, restoreBackup, previewDiff, readIfExists } from "../src/util/fs-safe.js";

const baseInput: GenerateInput = {
  name: "code-reviewer",
  role: "a senior code reviewer",
  description: "reviewing pull requests for security issues",
  behaviors: ["flag injection risks", "check error handling"],
  allowedTools: ["Read", "Grep"],
  mcpDependencies: [],
  targets: ["claude-code"],
};

describe("agent-spec", () => {
  it("accepts a valid spec and applies defaults", () => {
    const spec = parseAgentSpec({
      name: "my-agent",
      description: "use when doing things",
      role: "a helper",
      instructions: "Do the thing.",
      targets: ["claude-code"],
    });
    expect(spec.version).toBe("0.1.0");
    expect(spec.allowedTools).toEqual([]);
    expect(spec.source).toBe("generated");
  });

  it("rejects a non-kebab-case name", () => {
    const r = safeParseAgentSpec({
      name: "Bad Name",
      description: "use when doing things",
      role: "a helper",
      instructions: "x",
      targets: ["claude-code"],
    });
    expect(r.success).toBe(false);
  });

  it("requires at least one target", () => {
    const r = safeParseAgentSpec({
      name: "ok-name",
      description: "use when doing things",
      role: "a helper",
      instructions: "x",
      targets: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("generate", () => {
  it("builds a template instruction body from input", () => {
    const body = templateInstructions(baseInput);
    expect(body).toContain("a senior code reviewer");
    expect(body).toContain("flag injection risks");
    expect(body).toContain("Read, Grep");
  });

  it("generateSpec validates and uses the override when given", () => {
    const spec = generateSpec(baseInput, "Custom body.");
    expect(spec.instructions).toBe("Custom body.");
    expect(spec.name).toBe("code-reviewer");
  });

  it("generateSpec falls back to template without override", () => {
    const spec = generateSpec(baseInput);
    expect(spec.instructions).toContain("## Responsibilities");
  });

  it("seeds a responsibility from the purpose when no behaviors are given", () => {
    const body = templateInstructions({ ...baseInput, behaviors: [] });
    expect(body).toContain("## Responsibilities");
    // Capitalized purpose becomes the seed responsibility bullet.
    expect(body).toContain("- Reviewing pull requests for security issues.");
    expect(body).toContain("## When to use");
  });
});

describe("fs-safe", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "inspo-fs-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("atomicWrite creates parent dirs and writes", async () => {
    const f = join(dir, "a", "b", "file.txt");
    await atomicWrite(f, "hello");
    expect(await readFile(f, "utf8")).toBe("hello");
  });

  it("backup then restore round-trips", async () => {
    const f = join(dir, "f.txt");
    await writeFile(f, "original");
    const bak = await backup(f);
    expect(bak).toBe(`${f}.perezdev.bak`);
    await atomicWrite(f, "modified");
    expect(await readFile(f, "utf8")).toBe("modified");
    expect(await restoreBackup(f)).toBe(true);
    expect(await readFile(f, "utf8")).toBe("original");
    expect(await readIfExists(`${f}.perezdev.bak`)).toBeNull();
  });

  it("previewDiff marks added lines for a new file", () => {
    const diff = previewDiff(null, "line1\nline2");
    expect(diff.every((d) => d.type === "add")).toBe(true);
    expect(diff).toHaveLength(2);
  });
});
