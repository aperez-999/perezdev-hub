import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { agentFiles, mcpFiles } from "../src/adapters/plan.js";
import { isOwned, renderSkill, renderWindsurfRule } from "../src/adapters/render.js";
import { mcpFormat } from "../src/adapters/mcp-config.js";
import { TOOLS } from "../src/adapters/tools.js";
import { TOOL_IDS } from "../src/core/agent-spec.js";
import { projectScope, userScope } from "../src/core/scope.js";
import { dep, spec } from "./helpers.js";

const repo = "/work/app";
const project = projectScope(repo);
const rel = (paths: { path: string }[], root = repo) => paths.map((p) => p.path.slice(root.length + 1)).sort();

describe("agent file layout", () => {
  it("writes a Claude Code skill to .claude/skills/<name>/SKILL.md", () => {
    expect(rel(agentFiles(spec("reviewer", ["claude-code"]), project))).toEqual([".claude/skills/reviewer/SKILL.md"]);
  });

  it("gives Cursor and Copilot one shared copy in .agents/skills", () => {
    const files = agentFiles(spec("reviewer", ["cursor", "copilot"]), project);
    expect(rel(files)).toEqual([".agents/skills/reviewer/SKILL.md"]);
    expect(files[0]!.tools.sort()).toEqual(["copilot", "cursor"]);
  });

  it("lets Cursor reuse Claude Code's directory instead of adding a duplicate", () => {
    const files = agentFiles(spec("reviewer", ["claude-code", "cursor"]), project);
    expect(rel(files)).toEqual([".claude/skills/reviewer/SKILL.md"]);
    expect(files[0]!.tools.sort()).toEqual(["claude-code", "cursor"]);
  });

  it("needs only two skill copies for all four skill tools", () => {
    const files = agentFiles(spec("reviewer", ["claude-code", "codex", "cursor", "copilot"]), project);
    expect(rel(files)).toEqual([".agents/skills/reviewer/SKILL.md", ".claude/skills/reviewer/SKILL.md"]);
  });

  it("writes one rule file per rule-based tool", () => {
    const files = agentFiles(spec("reviewer", ["cline", "windsurf", "roo"]), project);
    expect(rel(files)).toEqual([".clinerules/reviewer.md", ".roo/rules/reviewer.md", ".windsurf/rules/reviewer.md"]);
  });

  it("uses the global locations at user scope", () => {
    const home = "/home/dev";
    process.env.HOME = home;
    const files = agentFiles(spec("reviewer", ["claude-code", "codex", "cline", "roo"]), userScope());
    expect(rel(files, home)).toEqual([
      ".agents/skills/reviewer/SKILL.md",
      ".claude/skills/reviewer/SKILL.md",
      ".roo/rules/reviewer.md",
      "Documents/Cline/Rules/reviewer.md",
    ]);
  });

  it("has no per-agent location for Windsurf at user scope", () => {
    process.env.HOME = "/home/dev";
    expect(agentFiles(spec("reviewer", ["windsurf"]), userScope())).toEqual([]);
  });

  it("maps MCP configs per scope and skips tools whose MCP format isn't managed", () => {
    process.env.HOME = "/home/dev";
    expect(mcpFiles(["claude-code", "cursor", "codex", "copilot"], project).map((f) => f.path)).toEqual([
      join(repo, ".mcp.json"),
      join(repo, ".cursor/mcp.json"),
      join(repo, ".codex/config.toml"),
    ]);
    expect(mcpFiles(["claude-code"], userScope()).map((f) => f.path)).toEqual(["/home/dev/.claude.json"]);
  });

  it("documents every tool", () => {
    for (const id of TOOL_IDS) expect(TOOLS[id].docs).toMatch(/^https:\/\//);
  });
});

describe("rendering", () => {
  it("emits Agent Skills frontmatter: name matches the folder, ownership in metadata", () => {
    const md = renderSkill(spec("pr-reviewer", ["claude-code"]));
    expect(md).toMatch(/^---\nname: pr-reviewer\ndescription: "?Use to /);
    expect(md).toContain("metadata:\n  generator: perezdev\n  version: 0.1.0\n---");
    expect(isOwned(md)).toBe(true);
  });

  it("gives Windsurf rules a model_decision trigger before the ownership stamp", () => {
    const md = renderWindsurfRule(spec("pr-reviewer", ["windsurf"]));
    expect(md).toMatch(/^---\ntrigger: model_decision\ndescription: /);
    expect(isOwned(md)).toBe(true);
  });

  it("does not claim hand-written files", () => {
    expect(isOwned("---\nname: mine\ndescription: my own skill\n---\n# Mine\n")).toBe(false);
    expect(isOwned("<!-- x-perezdev: true | version: 0.1.0 -->\n# legacy")).toBe(true);
  });
});

describe("MCP config editing (JSON)", () => {
  const json = mcpFormat("/c.json");

  it("merges servers without touching unrelated keys", () => {
    const raw = JSON.stringify({ theme: "dark", projects: { "/x": {} }, mcpServers: { other: { command: "uvx", args: [] } } });
    const out = JSON.parse(json.merge("/c.json", raw, [dep("docs")]));
    expect(out.theme).toBe("dark");
    expect(out.projects).toEqual({ "/x": {} });
    expect(Object.keys(out.mcpServers)).toEqual(["other", "docs"]);
  });

  it("refuses to rewrite a config it can't parse", () => {
    expect(() => json.merge("/c.json", "{ not json", [dep("docs")])).toThrow(/not valid JSON/);
  });

  it("prunes only the named servers and reports no-ops", () => {
    const raw = json.merge("/c.json", null, [dep("alpha"), dep("beta")]);
    expect(Object.keys(JSON.parse(json.prune("/c.json", raw, ["alpha"])!).mcpServers)).toEqual(["beta"]);
    expect(json.prune("/c.json", raw, ["missing"])).toBeNull();
  });
});

describe("MCP config editing (Codex TOML)", () => {
  const toml = mcpFormat("/config.toml");
  const existing = [
    "# my codex settings",
    'model = "gpt-5"',
    "",
    "[mcp_servers.mine]",
    'command = "uvx"   # keep this comment',
    'args = ["my-server"]',
    "",
    "[profiles.fast]",
    'model = "gpt-5-mini"',
    "",
  ].join("\n");

  it("appends a server table and leaves comments and other tables byte-for-byte", () => {
    const out = toml.merge("/config.toml", existing, [{ ...dep("docs"), env: { TOKEN_NAME: "x" } }]);
    expect(out.startsWith(existing.trimEnd())).toBe(true);
    expect(out).toContain('[mcp_servers.docs]\ncommand = "npx"\nargs = ["-y", "@example/docs"]\nenv = { TOKEN_NAME = "x" }\n');
    expect(Object.keys(toml.servers("/config.toml", out))).toEqual(["mine", "docs"]);
  });

  it("replaces an existing table in place of a duplicate", () => {
    const once = toml.merge("/config.toml", existing, [dep("docs")]);
    const twice = toml.merge("/config.toml", once, [dep("docs", ["-y", "@example/docs@2"])]);
    expect(twice.match(/\[mcp_servers\.docs\]/g)).toHaveLength(1);
    expect(twice).toContain("@example/docs@2");
  });

  it("prunes a table and its sub-tables, keeping neighbours", () => {
    const raw = existing + "\n[mcp_servers.docs]\ncommand = \"npx\"\nargs = []\n\n[mcp_servers.docs.env]\nA = \"1\"\n";
    const out = toml.prune("/config.toml", raw, ["docs"])!;
    expect(out).not.toContain("docs");
    expect(out).toContain("# keep this comment");
    expect(out).toContain("[profiles.fast]");
  });

  it("refuses servers it can't edit surgically, and invalid files", () => {
    const inline = 'mcp_servers = { docs = { command = "uvx", args = [] } }\n';
    expect(() => toml.merge("/config.toml", inline, [dep("docs")])).toThrow();
    expect(() => toml.merge("/config.toml", "model = ", [dep("docs")])).toThrow(/not valid TOML/);
  });
});

describe("trigger descriptions", () => {
  it("stays grammatical for gerund, imperative, and noun phrases", async () => {
    const { triggerDescription } = await import("../src/adapters/render.js");
    expect(triggerDescription("reviewing PRs for bugs")).toBe("Use when reviewing PRs for bugs.");
    expect(triggerDescription("Review PRs for bugs")).toBe("Use to review PRs for bugs.");
    expect(triggerDescription("a checklist for releases")).toBe("Use for a checklist for releases.");
    expect(triggerDescription("Use when touching migrations.")).toBe("Use when touching migrations.");
  });
});
