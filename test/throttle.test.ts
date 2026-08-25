import { describe, expect, it, vi } from "vitest";
import { throttleAppend } from "../src/util/throttle.js";

describe("throttleAppend", () => {
  it("batches tokens until the window, then flush empties the rest", () => {
    vi.useFakeTimers();
    const out: string[] = [];
    const stream = throttleAppend((c) => out.push(c), 50);
    stream.push("a");
    stream.push("b");
    expect(out).toEqual([]);
    vi.advanceTimersByTime(50);
    expect(out).toEqual(["ab"]);
    stream.push("c");
    stream.flush();
    expect(out).toEqual(["ab", "c"]);
    vi.useRealTimers();
  });
});
