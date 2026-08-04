import { describe, it, expect, afterEach } from "vitest";
import { enterHubScreen, leaveHubScreen, shouldUseAltScreen } from "../src/tui/screen.js";

describe("hub alternate screen", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env.VITEST = prev.VITEST;
    process.env.NODE_ENV = prev.NODE_ENV;
    process.env.PDH_NO_ALT = prev.PDH_NO_ALT;
  });

  it("stays off under Vitest so tests do not hijack the TTY", () => {
    process.env.VITEST = "1";
    expect(shouldUseAltScreen()).toBe(false);
    const chunks: string[] = [];
    const stream = { write: (s: string) => chunks.push(s) } as unknown as NodeJS.WriteStream;
    enterHubScreen(stream);
    leaveHubScreen(stream);
    expect(chunks).toEqual([]);
  });
});
