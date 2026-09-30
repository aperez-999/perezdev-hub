import { describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AGENTS_PREAMBLE, importsAgentsMd, readSection, upsertSection } from "../src/adapters/context.js";
import { detectCommands } from "../src/core/commands.js";
import { diagnose, repair } from "../src/core/doctor.js";
import { commit } from "../src/core/install.js";
import { exists } from "../src/util/fs-safe.js";
import { spec, useSandbox } from "./helpers.js";

const box = useSandbox();
const write = (rel: string, text: string) => writeFile(join(box.repo, rel), text);

describe("managed sections", () => {
  const mine = "# Project\n\nUse tabs.\n";

  it("appends a block, replaces it in place, and removes it leaving the user's text as it was", () => {
    const added = upsertSection(mine, "## Commands\n- Test: `npm test`", AGENTS_PREAMBLE)!;
    expect(added).toBe("# Project\n\nUse tabs.\n\n<!-- perezdev:begin -->\n## Commands\n- Test: `npm test`\n<!-- perezdev:end -->\n");
    const edited = added.replace("Use tabs.", "Use tabs. Always.");
    const replaced = upsertSection(edited, "## Commands\n- Test: `pnpm test`", AGENTS_PREAMBLE)!;
    expect(readSection(replaced)).toBe("## Commands\n- Test: `pnpm test`");
    expect(replaced).toContain("Use tabs. Always.");
    expect(upsertSection(added, "## Commands\n- Test: `npm test`", AGENTS_PREAMBLE)).toBeNull();
    expect(upsertSection(added, null, AGENTS_PREAMBLE)).toBe(mine);
  });

  it("deletes a file that held nothing but perezdev's preamble", () => {
    const created = upsertSection(null, "body", AGENTS_PREAMBLE)!;
    expect(upsertSection(created, null, AGENTS_PREAMBLE)).toBe("");
  });

  it("notices an existing @AGENTS.md import outside the block", () => {
    expect(importsAgentsMd("# Notes\n@AGENTS.md\n")).toBe(true);
    expect(importsAgentsMd("<!-- perezdev:begin -->\n@AGENTS.md\n<!-- perezdev:end -->\n")).toBe(false);
  });
});

describe("detectCommands", () => {
  it("uses the package manager and scripts a Node repo declares", async () => {
    await write("package.json", JSON.stringify({ scripts: { build: "tsc", test: "vitest", lint: "eslint .", "type-check": "tsc --noEmit" } }));
    await write("package-lock.json", "{}");
    expect(await detectCommands(box.repo)).toEqual([
      { label: "Install", command: "npm ci" },
      { label: "Build", command: "npm run build" },
      { label: "Test", command: "npm test" },
      { label: "Lint", command: "npm run lint" },
      { label: "Type check", command: "npm run type-check" },
    ]);
  });

  it("labels each language in a polyglot repo and fills gaps from the Makefile", async () => {
    await write("pyproject.toml", '[project]\ndependencies = []\n[tool.pytest.ini_options]\n[tool.ruff]\n');
    await write("uv.lock", "");
    await write("go.mod", "module x\n");
    await write("Makefile", "fmt:\n\tgofmt -w .\n");
    const labels = (await detectCommands(box.repo)).map((c) => `${c.label}: ${c.command}`);
    expect(labels).toEqual([
      "Install (Python): uv sync",
      "Test (Python): uv run pytest",
      "Lint (Python): uv run ruff check .",
      "Build (Go): go build ./...",
      "Test (Go): go test ./...",
      "Lint (Go): go vet ./...",
      "Format: make fmt",
    ]);
  });
});

describe("AGENTS.md in the lockfile", () => {
  it("writes AGENTS.md and links CLAUDE.md, flags stale commands, and cleans up when turned off", async () => {
    await write("package.json", JSON.stringify({ scripts: { test: "vitest" } }));
    await write("AGENTS.md", "# Repo\n\nHouse rules.\n");
    await commit(box.project, { agents: [spec("reviewer", ["claude-code"])], agentsMd: true });

    const agents = await readFile(join(box.repo, "AGENTS.md"), "utf8");
    expect(agents.startsWith("# Repo\n\nHouse rules.\n\n<!-- perezdev:begin -->\n## Commands")).toBe(true);
    expect(agents).toContain("- Test: `npm test`");
    expect(readSection(await readFile(join(box.repo, "CLAUDE.md"), "utf8"))).toBe("@AGENTS.md");
    expect((await diagnose(box.project)).filter((i) => i.kind === "context").map((i) => i.status)).toEqual(["ok", "ok"]);

    await write("package.json", JSON.stringify({ scripts: { test: "vitest", lint: "eslint ." } }));
    const stale = await diagnose(box.project);
    expect(stale.find((i) => i.name === "AGENTS.md")!.status).toBe("modified");
    await repair(box.project, stale);
    expect(await readFile(join(box.repo, "AGENTS.md"), "utf8")).toContain("- Lint: `npm run lint`");

    await commit(box.project, { agentsMd: false });
    expect(await readFile(join(box.repo, "AGENTS.md"), "utf8")).toBe("# Repo\n\nHouse rules.\n");
    expect(await exists(join(box.repo, "CLAUDE.md"))).toBe(false);
  });

  it("leaves CLAUDE.md alone when it already imports AGENTS.md, and is project-only", async () => {
    await write("package.json", JSON.stringify({ scripts: { test: "vitest" } }));
    await mkdir(join(box.repo, ".claude"));
    await write("CLAUDE.md", "# Notes\n\n@AGENTS.md\n");
    await commit(box.project, { agentsMd: true });
    expect(await readFile(join(box.repo, "CLAUDE.md"), "utf8")).toBe("# Notes\n\n@AGENTS.md\n");
    await expect(commit(box.user(), { agentsMd: true })).rejects.toThrow(/per project/);
  });
});
