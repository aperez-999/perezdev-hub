import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { App } from "../src/tui/app.js";

let home: string;
let cwd: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "pdh-tui-"));
  cwd = await mkdtemp(join(tmpdir(), "pdh-proj-"));
  await writeFile(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "18" } }));
  process.env.HOME = home;
  delete process.env.XDG_CONFIG_HOME;
  process.chdir(cwd);
});
afterEach(async () => {
  process.chdir(tmpdir());
  await rm(home, { recursive: true, force: true });
  await rm(cwd, { recursive: true, force: true });
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, timeout = 4000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fn()) return;
    await wait(50);
  }
  throw new Error("condition not met in time");
}

describe("TUI App", () => {
  it("renders the home after scanning and navigates into Recommend", async () => {
    const { lastFrame, stdin } = render(<App />);
    expect(lastFrame()).toMatch(/PEREZDEV|scanning/i);
    await until(() => /Recommend for this project/.test(lastFrame() ?? ""));
    expect(lastFrame()).toMatch(/Prompt local AI/);

    // "Prompt local AI" is first; move down to "Recommend" (j), then select.
    stdin.write("j");
    await wait(80);
    stdin.write("\r");
    await until(() => /Recommended|fully set up/.test(lastFrame() ?? ""));
  });

  it("opens the local-AI chat console", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /Prompt local AI/.test(lastFrame() ?? ""));
    stdin.write("\r"); // first item is "Prompt local AI"
    await until(() => /AUTOMATION STREAM/.test(lastFrame() ?? ""));
    expect(lastFrame()).toMatch(/PerezDev Hub v2\.0/);
  });
});
