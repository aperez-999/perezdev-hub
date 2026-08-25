import { describe, expect, it } from "vitest";
import { slugify } from "../src/core/slug.js";

describe("slugify", () => {
  it("drops stopwords and keeps the last token when there are four+", () => {
    expect(slugify("backend developer who fixes bugs")).toBe("backend-developer-bugs");
  });

  it("takes three tokens when that is all that remains", () => {
    expect(slugify("embedded rust engineer")).toBe("embedded-rust-engineer");
  });

  it("falls back to agent for empty or stopword-only input", () => {
    expect(slugify("the who that")).toBe("agent");
    expect(slugify("")).toBe("agent");
  });
});
