import { describe, it, expect } from "vitest";
import { skillMetaprompt, mcpMetaprompt, parseMcpConfig } from "../src/core/metaprompt.js";

describe("skillMetaprompt", () => {
  it("embeds the goal and the required section headings", () => {
    const p = skillMetaprompt("embedded rust engineer");
    expect(p).toContain('"embedded rust engineer"');
    expect(p).toContain("# Role Definition & Scope");
    expect(p).toContain("# Target Definitions of Done");
    expect(p).toMatch(/ONLY the raw markdown/i);
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
