import { describe, it, expect } from "vitest";
import { inferDomains } from "../src/core/domains.js";
import { templateInstructions, type GenerateInput } from "../src/core/generate.js";

describe("domain inference", () => {
  it("matches review + security domains and merges their bullets", () => {
    const { responsibilities, guidelines } = inferDomains("review code for security issues");
    expect(responsibilities.some((r) => /correctness bugs/i.test(r))).toBe(true); // review domain
    expect(responsibilities.some((r) => /OWASP/i.test(r))).toBe(true); // security domain
    expect(guidelines.length).toBeGreaterThan(0);
  });

  it("an accessibility purpose pulls in a11y-specific responsibilities", () => {
    const { responsibilities } = inferDomains("review components for accessibility (a11y) issues");
    expect(responsibilities.some((r) => /ARIA|contrast|keyboard/i.test(r))).toBe(true);
  });

  it("a frontend role pulls in UI-specific guidance", () => {
    const { responsibilities, workflow } = inferDomains("frontend dev");
    expect(responsibilities.some((r) => /responsive|UI component|state/i.test(r))).toBe(true);
    expect(workflow.some((w) => /accessib|responsive|breakpoint/i.test(w))).toBe(true);
  });

  it("an AI-engineer role pulls in model/eval guidance", () => {
    const { responsibilities, done } = inferDomains("ai engineer");
    expect(responsibilities.some((r) => /prompt|retrieval|fine-tun|model/i.test(r))).toBe(true);
    expect(done.some((d) => /eval|accuracy|cost/i.test(d))).toBe(true);
  });

  it("returns nothing for an unmatched purpose", () => {
    const { responsibilities, guidelines } = inferDomains("water the office plants");
    expect(responsibilities).toEqual([]);
    expect(guidelines).toEqual([]);
  });
});

describe("templateInstructions detail scaling", () => {
  const input = (over: Partial<GenerateInput>): GenerateInput => ({
    name: "x",
    role: "a helper",
    description: "doing a thing for the team",
    behaviors: [],
    allowedTools: [],
    mcpDependencies: [],
    targets: ["claude-code"],
    ...over,
  });

  it("a generic agent gets a lean but complete body", () => {
    const body = templateInstructions(input({ name: "note-taker", description: "summarizing meeting notes" }));
    expect(body).toContain("## When to use");
    expect(body).toContain("## Responsibilities");
    expect(body).toContain("## Guidelines");
  });

  it("a domain agent gets richer, deduped responsibilities", () => {
    const generic = templateInstructions(input({ name: "x", description: "doing a thing for the team" }));
    const debug = templateInstructions(
      input({ name: "debugger", description: "fixing a failing test and finding the bug" }),
    );
    const count = (s: string) => s.split("\n").filter((l) => l.startsWith("- ")).length;
    expect(count(debug)).toBeGreaterThan(count(generic));
    // No duplicate bullets.
    const bullets = debug.split("\n").filter((l) => l.startsWith("- "));
    expect(new Set(bullets).size).toBe(bullets.length);
  });

  it("lists MCP dependencies when present", () => {
    const body = templateInstructions(
      input({ mcpDependencies: [{ name: "filesystem", command: "npx", args: ["-y", "srv"], env: {} }] }),
    );
    expect(body).toContain("## MCP servers");
    expect(body).toContain("`filesystem`");
  });
});
