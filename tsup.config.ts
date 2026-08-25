import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  dts: false,
  sourcemap: true,
  splitting: true,
  // Keep the optional LLM SDK out of the bundle so it stays truly optional
  // (loaded at runtime only when installed and a key is present).
  external: ["@anthropic-ai/sdk"],
  banner: { js: "#!/usr/bin/env node" },
});
