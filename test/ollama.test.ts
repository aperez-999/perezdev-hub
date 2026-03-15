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
  it("degrades gracefully when Ollama is not running", async () => {
    // No Ollama in CI/dev → available false, no models, but never throws.
    const status = await detectOllama();
    expect(status.available).toBe(false);
    expect(status.models).toEqual([]);
    expect(typeof status.error).toBe("string");
  });
});
