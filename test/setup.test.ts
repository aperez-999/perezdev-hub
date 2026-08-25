import { describe, expect, it } from "vitest";
import { initialSelected, missingSelected, shouldOfferCoreMcp, toggleId } from "../src/core/setup.js";
import { toolInstallCommand } from "../src/core/tool-install.js";
import type { ToolPresence } from "../src/core/setup.js";

const TOOLS: ToolPresence[] = [
  { id: "cursor", name: "Cursor", present: true },
  { id: "claude-code", name: "Claude Code", present: false },
  { id: "codex", name: "Codex", present: false },
];

describe("setup selection", () => {
  it("starts present tools on", () => {
    expect(initialSelected(TOOLS)).toEqual(["cursor"]);
  });

  it("lists selected-but-missing tools", () => {
    expect(missingSelected(TOOLS, ["cursor", "claude-code"]).map((t) => t.id)).toEqual(["claude-code"]);
    expect(missingSelected(TOOLS, ["cursor"])).toEqual([]);
  });

  it("toggles ids", () => {
    expect(toggleId(["cursor"], "claude-code")).toEqual(["cursor", "claude-code"]);
    expect(toggleId(["cursor", "claude-code"], "cursor")).toEqual(["claude-code"]);
  });

  it("offers filesystem+git MCP for git or language repos", () => {
    expect(shouldOfferCoreMcp({ git: true })).toBe(true);
    expect(shouldOfferCoreMcp({ languages: ["typescript"] })).toBe(true);
    expect(shouldOfferCoreMcp({})).toBe(false);
  });
});

describe("toolInstallCommand", () => {
  it("returns official copy-paste strings and never empty", () => {
    expect(toolInstallCommand("claude-code")).toContain("npm install -g @anthropic-ai/claude-code");
    expect(toolInstallCommand("cursor")).toMatch(/cursor\.com/i);
    expect(toolInstallCommand("codex")).toContain("@openai/codex");
  });
});
