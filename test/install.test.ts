import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "inspo-install-"));
  process.env.HOME = home;
  delete process.env.XDG_CONFIG_HOME;
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("install core", () => {
  it("bumpPatch increments x.y.z and handles odd input", async () => {
    const { bumpPatch } = await import("../src/core/install.js");
    expect(bumpPatch("0.1.0")).toBe("0.1.1");
    expect(bumpPatch("1.2.9")).toBe("1.2.10");
    expect(bumpPatch("3")).toBe("3.1");
  });

  it("installSpec writes files for every target and records the lockfile", async () => {
    const { generateSpec } = await import("../src/core/generate.js");
    const { installSpec } = await import("../src/core/install.js");
    const { getAgentSpec } = await import("../src/core/lockfile.js");

    const spec = generateSpec({
      name: "doc-writer",
      role: "a writer",
      description: "writing docs for the project",
      behaviors: [],
      allowedTools: [],
      mcpDependencies: [],
      targets: ["claude-code", "codex"],
    });
    const written = await installSpec(spec, "2026-06-12T00:00:00.000Z");

    expect(written).toHaveLength(2);
    expect(await readFile(join(home, ".claude", "skills", "doc-writer", "SKILL.md"), "utf8")).toContain(
      "doc-writer",
    );
    expect(await readFile(join(home, ".codex", "prompts", "doc-writer.md"), "utf8")).toContain("doc-writer");
    expect((await getAgentSpec("doc-writer"))?.targets).toEqual(["claude-code", "codex"]);
  });
});

describe("presets", () => {
  it("exposes curated presets resolvable by id", async () => {
    const { PRESETS, getPreset } = await import("../src/core/presets.js");
    expect(PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(getPreset("code-reviewer")?.input.name).toBe("code-reviewer");
    expect(getPreset("nope")).toBeUndefined();
  });

  it("preset input forms a valid spec once targets are added", async () => {
    const { getPreset } = await import("../src/core/presets.js");
    const { generateSpec } = await import("../src/core/generate.js");
    const preset = getPreset("test-writer")!;
    const spec = generateSpec({ ...preset.input, targets: ["cursor"] });
    expect(spec.name).toBe("test-writer");
    expect(spec.instructions.length).toBeGreaterThan(0);
  });
});

describe("export → import roundtrip", () => {
  it("a serialized spec re-parses and installs", async () => {
    const { generateSpec } = await import("../src/core/generate.js");
    const { safeParseAgentSpec } = await import("../src/core/agent-spec.js");
    const { installSpec } = await import("../src/core/install.js");
    const { getAgentSpec } = await import("../src/core/lockfile.js");

    const spec = generateSpec({
      name: "commit-helper",
      role: "a commit assistant",
      description: "writing commit messages from diffs",
      behaviors: [],
      allowedTools: [],
      mcpDependencies: [],
      targets: ["claude-code"],
    });
    const json = JSON.stringify(spec);
    const parsed = safeParseAgentSpec(JSON.parse(json));
    expect(parsed.success).toBe(true);

    await installSpec(parsed.success ? parsed.data : spec, "2026-06-12T00:00:00.000Z");
    expect(await getAgentSpec("commit-helper")).not.toBeNull();
  });
});
