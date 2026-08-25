import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fetchSuperpowersSkills,
  parseSkillMarkdown,
  planSuperpowersPack,
  skillToSpec,
} from "../src/core/superpowers.js";

const SAMPLE = `---
name: brainstorming
description: Use when creating or developing a new feature or product
---

# Brainstorming

Work with the user to shape the idea before writing code.
`.repeat(2);

describe("parseSkillMarkdown", () => {
  it("keeps a valid kebab name and frontmatter description", () => {
    const skill = parseSkillMarkdown(SAMPLE, "brainstorming");
    expect(skill?.name).toBe("brainstorming");
    expect(skill?.description).toMatch(/creating or developing/);
    expect(skill?.instructions).toContain("Brainstorming");
  });

  it("rejects a nearly empty body", () => {
    expect(parseSkillMarkdown("---\nname: x\n---\n\nhi\n", "x")).toBeNull();
  });
});

describe("fetchSuperpowersSkills", () => {
  it("parses raw SKILL.md responses from the fetcher", async () => {
    const fetcher = (async (input: string | URL) => {
      const url = String(input);
      const id = url.split("/skills/")[1]?.split("/")[0] ?? "skill";
      return new Response(
        `---\nname: ${id}\ndescription: Superpowers skill for ${id} workflows in an SDLC\n---\n\n${"# Body\n\nDo the work with care.\n".repeat(5)}`,
        { status: 200 },
      );
    }) as typeof fetch;
    const { skills, error } = await fetchSuperpowersSkills(fetcher);
    expect(error).toBeUndefined();
    expect(skills.length).toBeGreaterThan(5);
    expect(skills.some((s) => s.name === "using-superpowers")).toBe(true);
  });

  it("returns an error when every fetch fails", async () => {
    const fetcher = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const { skills, error } = await fetchSuperpowersSkills(fetcher);
    expect(skills).toEqual([]);
    expect(error).toMatch(/network/);
  });
});

describe("planSuperpowersPack", () => {
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "pdh-sp-"));
    process.env.HOME = home;
    delete process.env.XDG_CONFIG_HOME;
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("plans files into the chosen targets", async () => {
    const skill = parseSkillMarkdown(SAMPLE, "brainstorming");
    expect(skill).not.toBeNull();
    const spec = skillToSpec(skill!, ["claude-code"]);
    expect(spec.source).toBe("imported");
    const planned = await planSuperpowersPack([skill!], ["claude-code"]);
    expect(planned.some((f) => f.path.includes("brainstorming") && f.path.endsWith("SKILL.md"))).toBe(true);
  });
});
