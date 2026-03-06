import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAgentSpec } from "../src/core/agent-spec.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "inspo-lock-"));
  process.env.HOME = home;
  delete process.env.XDG_CONFIG_HOME;
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

const sample = () =>
  parseAgentSpec({
    name: "agent-one",
    description: "use when testing the lockfile",
    role: "a tester",
    instructions: "Test.",
    targets: ["claude-code"],
  });

describe("lockfile", () => {
  it("upserts, reads, and removes an entry", async () => {
    const { upsertAgent, getAgentSpec, listEntries, removeAgentEntry } = await import(
      "../src/core/lockfile.js"
    );
    await upsertAgent(sample(), "2026-01-01T00:00:00.000Z");

    const got = await getAgentSpec("agent-one");
    expect(got?.name).toBe("agent-one");

    const entries = await listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.installedAt).toBe("2026-01-01T00:00:00.000Z");

    expect(await removeAgentEntry("agent-one")).toBe(true);
    expect(await getAgentSpec("agent-one")).toBeNull();
  });

  it("returns an empty lockfile when none exists", async () => {
    const { listEntries } = await import("../src/core/lockfile.js");
    expect(await listEntries()).toEqual([]);
  });
});
