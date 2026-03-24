import { describe, it, expect, afterEach } from "vitest";
import { resolveProvider } from "../src/core/provider.js";

const empty = { available: false, models: [] as string[], normal: null, thinking: null };

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

describe("provider resolution", () => {
  it("prefers a local model when one is pulled", () => {
    const p = resolveProvider({ available: true, models: ["qwen2.5-coder"], normal: "qwen2.5-coder", thinking: "qwen2.5-coder" });
    expect(p.kind).toBe("local");
    if (p.kind === "local") expect(p.model).toBe("qwen2.5-coder");
  });

  it("falls back to Anthropic when a key is set and no local model", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const p = resolveProvider(empty);
    expect(p.kind).toBe("cloud");
    expect(p.status).toBe("cloud active");
  });

  it("reports a reason when nothing is available", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(resolveProvider(empty).status).toBe("ollama down");
    expect(resolveProvider({ ...empty, available: true }).status).toBe("no models found");
  });
});
