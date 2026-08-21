import { describe, it, expect } from "vitest";
import { isCursorHost } from "../src/core/host.js";

describe("isCursorHost", () => {
  it("is true when CURSOR_TRACE_ID is set", () => {
    const prev = process.env.CURSOR_TRACE_ID;
    process.env.CURSOR_TRACE_ID = "test";
    expect(isCursorHost()).toBe(true);
    if (prev === undefined) delete process.env.CURSOR_TRACE_ID;
    else process.env.CURSOR_TRACE_ID = prev;
  });
});
