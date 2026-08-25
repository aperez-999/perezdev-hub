import { describe, expect, it } from "vitest";
import { isBareHelpInput, navFromData, nextPage } from "../src/tui/nav.js";

describe("navFromData", () => {
  it("maps F1–F3 (SS3 and CSI) to pages", () => {
    expect(navFromData("\x1bOP")).toEqual({ page: 1 });
    expect(navFromData("\x1bOQ")).toEqual({ page: 2 });
    expect(navFromData("\x1bOR")).toEqual({ page: 3 });
    expect(navFromData("\x1b[11~")).toEqual({ page: 1 });
    expect(navFromData("\x1bOS")).toEqual({ page: 4 });
    expect(navFromData("\x1b[14~")).toEqual({ page: 4 });
  });

  it("maps Shift+arrows to cycle intents", () => {
    expect(navFromData("\x1b[1;2C")).toEqual({ cycle: 1 });
    expect(navFromData("\x1b[1;2D")).toEqual({ cycle: -1 });
  });

  it("ignores unrelated sequences", () => {
    expect(navFromData("a")).toBeNull();
    expect(navFromData("\x1b[A")).toBeNull();
  });
});

describe("nextPage", () => {
  it("wraps at both ends", () => {
    expect(nextPage(1, -1)).toBe(4);
    expect(nextPage(4, 1)).toBe(1);
    expect(nextPage(3, 1)).toBe(4);
  });
});

describe("isBareHelpInput", () => {
  it("treats a lone ? on an empty field as help", () => {
    expect(isBareHelpInput("?", "")).toBe(true);
    expect(isBareHelpInput("?", "   ")).toBe(true);
    expect(isBareHelpInput("?", "why")).toBe(false);
    expect(isBareHelpInput("??", "")).toBe(false);
  });
});
