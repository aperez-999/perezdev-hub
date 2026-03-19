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

describe("Console TUI", () => {
  it("renders the bordered OpenDev console with header, badges, and stream", async () => {
    const { lastFrame } = render(<App />);
    await until(() => /AUTOMATION & LOG STREAM/.test(lastFrame() ?? ""));
    const f = lastFrame() ?? "";
    expect(f).toMatch(/PerezDev Hub v2\.0/);
    expect(f).toMatch(/\[IDEs\]/);
    expect(f).toMatch(/\[CLIs\]/);
    expect(f).toMatch(/Autonomy: manual/);
  });

  it("runs the /help slash command into the log stream", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /AUTOMATION & LOG STREAM/.test(lastFrame() ?? ""));
    await wait(1000); // let the engine/ollama detect settle
    for (const ch of "/help") {
      stdin.write(ch);
      await wait(20);
    }
    await wait(150);
    stdin.write("\r");
    await until(() => /commands:/.test(lastFrame() ?? ""), 6000);
  });
});
