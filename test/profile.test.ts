import { describe, it, expect } from "vitest";
import { buildProfile, parseProfile, profileToServer } from "../src/core/profile.js";
import { parseAgentSpec } from "../src/core/agent-spec.js";
import type { LockEntry, McpEntry } from "../src/core/lockfile.js";

const spec = parseAgentSpec({
  name: "pr-reviewer",
  description: "review pull requests",
  role: "a pr reviewer",
  instructions: "You are a pr reviewer.",
  targets: ["claude-code"],
  source: "generated",
});
const agents: LockEntry[] = [{ spec, installedAt: "2026-06-16T00:00:00Z" }];
const mcp: McpEntry[] = [
  { id: "git", name: "Git", dependency: { name: "git", command: "npx", args: ["-y", "server-git"], env: {} }, targets: ["claude-code"], installedAt: "2026-06-16T00:00:00Z" },
];

describe("buildProfile", () => {
  it("bundles agents and mcp into a valid profile that round-trips", () => {
    const profile = buildProfile(agents, mcp, "my-setup", "2026-06-16T00:00:00Z");
    expect(profile.perezdevProfile).toBe(1);
    expect(profile.name).toBe("my-setup");
    expect(profile.agents).toHaveLength(1);
    expect(profile.mcp[0]!.id).toBe("git");
    // round-trips through serialize → parse
    const reparsed = parseProfile(JSON.stringify(profile));
    expect(reparsed.agents[0]!.name).toBe("pr-reviewer");
    expect(reparsed.mcp[0]!.dependency.command).toBe("npx");
  });
});

describe("parseProfile", () => {
  it("rejects malformed JSON", () => {
    expect(() => parseProfile("{not json")).toThrow(/not valid JSON/);
  });
  it("rejects a non-profile object", () => {
    expect(() => parseProfile('{"foo":1}')).toThrow(/not a PerezDev profile/);
  });
  it("rejects a wrong version", () => {
    expect(() => parseProfile('{"perezdevProfile":2,"agents":[],"mcp":[]}')).toThrow(/invalid profile/);
  });
  it("accepts a minimal valid profile", () => {
    const p = parseProfile('{"perezdevProfile":1,"agents":[],"mcp":[]}');
    expect(p.name).toBe("profile");
    expect(p.agents).toEqual([]);
  });
  it("rejects an MCP launch outside the allowlist", () => {
    const raw = JSON.stringify({
      perezdevProfile: 1,
      agents: [],
      mcp: [
        {
          id: "evil",
          name: "Evil",
          dependency: { name: "evil", command: "bash", args: ["-c", "curl x"], env: {} },
        },
      ],
    });
    expect(() => parseProfile(raw)).toThrow(/allowlisted/);
  });
});

describe("profileToServer", () => {
  it("maps an MCP entry into an installable server", () => {
    const server = profileToServer({ id: "git", name: "Git", dependency: { name: "git", command: "npx", args: ["-y", "x"], env: { TOKEN: "t" } } });
    expect(server.id).toBe("git");
    expect(server.command).toBe("npx");
    expect(server.env).toEqual({ TOKEN: "t" });
    expect(server.tags).toContain("profile");
  });
});
