import { describe, it, expect } from "vitest";
import {
  skillMetaprompt,
  mcpMetaprompt,
  parseMcpConfig,
  looksLikeSkillMarkdown,
  formatScanContext,
} from "../src/core/metaprompt.js";

describe("skillMetaprompt", () => {
  it("embeds the goal, scan stack, and template headings", () => {
    const p = skillMetaprompt("backend developer who fixes bugs", {
      languages: ["typescript"],
      frameworks: ["express"],
      testFrameworks: ["vitest"],
    });
    expect(p).toContain('"backend developer who fixes bugs"');
    expect(p).toContain("typescript, express, vitest");
    expect(p).toContain("## When to use");
    expect(p).toContain("## Definition of done");
    expect(p).toContain("## Guardrails");
    expect(p).not.toContain("Role Definition");
    expect(p).toMatch(/Log4j/);
  });

  it("stays generic when there is no scan", () => {
    const p = skillMetaprompt("embedded rust engineer");
    expect(p).toContain("Do not invent a stack");
  });
});

describe("looksLikeSkillMarkdown", () => {
  it("accepts template-shaped bodies and rejects chat filler", () => {
    const body = [
      "You are a backend specialist.",
      "",
      "## When to use",
      "",
      "Use this for API bugs.",
      "",
      "## Workflow",
      "",
      "1. Reproduce.",
      "",
      "## Guardrails",
      "",
      "Stay in scope.",
      "x".repeat(120),
    ].join("\n");
    expect(looksLikeSkillMarkdown(body)).toBe(true);
    expect(looksLikeSkillMarkdown("Sure! Here is a skill.")).toBe(false);
    expect(looksLikeSkillMarkdown("# Role Definition & Scope\n\n" + "y".repeat(200))).toBe(false);
  });
});

describe("formatScanContext", () => {
  it("dedupes languages and frameworks", () => {
    expect(formatScanContext({ languages: ["typescript", "typescript"], frameworks: ["react"] })).toBe(
      "typescript, react",
    );
  });
});

describe("mcpMetaprompt", () => {
  it("embeds the request and only includes config when provided", () => {
    expect(mcpMetaprompt("add slack")).toContain('"add slack"');
    expect(mcpMetaprompt("add slack")).not.toContain("current mcp.json");
    expect(mcpMetaprompt("add slack", '{"mcpServers":{}}')).toContain("current mcp.json");
  });
});

describe("parseMcpConfig", () => {
  it("parses a plain JSON object", () => {
    const r = parseMcpConfig('{"command":"npx","args":["-y","srv"],"env":{"TOKEN":"x"}}');
    expect(r).toEqual({ command: "npx", args: ["-y", "srv"], env: { TOKEN: "x" } });
  });

  it("strips ```json fences", () => {
    const r = parseMcpConfig('```json\n{"command":"docker","args":["run"]}\n```');
    expect(r.command).toBe("docker");
    expect(r.args).toEqual(["run"]);
    expect(r.env).toEqual({});
  });

  it("unwraps an mcpServers wrapper", () => {
    const r = parseMcpConfig('{"mcpServers":{"slack":{"command":"npx","args":["slack-mcp"]}}}');
    expect(r.command).toBe("npx");
    expect(r.args).toEqual(["slack-mcp"]);
  });

  it("ignores surrounding prose", () => {
    const r = parseMcpConfig('Here you go:\n{"command":"node","args":["x.js"]}\nHope that helps!');
    expect(r.command).toBe("node");
  });

  it("throws when there is no command", () => {
    expect(() => parseMcpConfig('{"args":["x"]}')).toThrow(/command/);
    expect(() => parseMcpConfig("not json at all")).toThrow();
  });
});
