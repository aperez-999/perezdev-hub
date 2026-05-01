import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { detectOllama } from "../src/core/ollama.js";

const hasPython = (() => {
  try {
    execSync("python3 --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.runIf(hasPython)("ollama routing", () => {
  it("returns a well-formed status and never throws", async () => {
    // Whether or not Ollama is running locally, detect must resolve cleanly.
    const status = await detectOllama();
    expect(typeof status.available).toBe("boolean");
    expect(Array.isArray(status.models)).toBe(true);
    if (status.available) {
      // Reachable: models is a (possibly empty) list, no error.
      expect(status.error).toBeUndefined();
    } else {
      // Unreachable: graceful, with a readable reason and no models.
      expect(status.models).toEqual([]);
      expect(typeof status.error).toBe("string");
    }
  });
});
