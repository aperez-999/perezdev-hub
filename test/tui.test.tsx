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
  // The spawned Python engine may still be writing cache files into HOME during
  // teardown; retry the removal to absorb that race.
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  await rm(cwd, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const ESC = String.fromCharCode(27);
const F2 = ESC + "OQ";
const F3 = ESC + "OR";
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
    await typeLine(stdin, "/help");
    await until(() => /commands:/.test(lastFrame() ?? ""), 6000);
  });

  it("switches pages with function keys and Escape", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /AUTOMATION & LOG STREAM/.test(lastFrame() ?? ""));
    await wait(800);
    stdin.write("OQ"); // F2
    await until(() => /AGENT TOOLKIT/.test(lastFrame() ?? ""), 4000);
    expect(lastFrame()).toMatch(/Create Custom Agent Skill/);
    stdin.write("OR"); // F3
    await until(() => /INDUSTRY SERVER DIRECTORY/.test(lastFrame() ?? ""), 4000);
    expect(lastFrame()).toMatch(/Run Discovery Scanner/);
    stdin.write(ESC); // Escape -> back to chat
    await until(() => /AUTOMATION & LOG STREAM/.test(lastFrame() ?? ""), 4000);
  }, 15000);

  it("restores the last active tab from ~/.perezdevrc on boot", async () => {
    await writeFile(
      join(home, ".perezdevrc"),
      JSON.stringify({ last_active_tab: 3, autonomy_mode: "auto", mcp_ignored_servers: [] }),
    );
    const { lastFrame } = render(<App />);
    await until(() => /INDUSTRY SERVER DIRECTORY/.test(lastFrame() ?? ""), 4000);
    expect(lastFrame()).toMatch(/Autonomy: auto/);
  }, 15000);

  it("F3 shows the industry MCP directory and custom prompt field", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /AUTOMATION & LOG STREAM/.test(lastFrame() ?? ""));
    await wait(800);
    stdin.write(F3);
    await until(() => /INDUSTRY SERVER DIRECTORY/.test(lastFrame() ?? ""), 4000);
    const f = lastFrame() ?? "";
    expect(f).toMatch(/Local Filesystem/);
    expect(f).toMatch(/PostgreSQL Database/);
    expect(f).toMatch(/Run Discovery Scanner/);
    expect(f).toMatch(/integration prompt/);
  }, 15000);

  it("F3 Enter on a directory item pops an install confirm", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /AUTOMATION & LOG STREAM/.test(lastFrame() ?? ""));
    await wait(800);
    stdin.write(F3);
    await until(() => /INDUSTRY SERVER DIRECTORY/.test(lastFrame() ?? ""), 4000);
    await wait(200);
    stdin.write("\r"); // install the highlighted (first) item
    await until(() => /install mcp filesystem/.test(lastFrame() ?? ""), 6000);
    expect(lastFrame()).toMatch(/MANUAL CONFIRMATION REQUIRED/);
  }, 15000);

  it("opens the Create Custom Agent overlay on F2 → Enter", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /AUTOMATION & LOG STREAM/.test(lastFrame() ?? ""));
    await wait(800);
    stdin.write("OQ"); // F2
    await until(() => /AGENT TOOLKIT/.test(lastFrame() ?? ""), 4000);
    await wait(200);
    stdin.write("\r"); // Enter on first item
    await until(() => /Agent Goal:/.test(lastFrame() ?? ""), 4000);
  }, 15000);

  it("/build pops an inline manual confirm and applies on Y", async () => {
    const { lastFrame, stdin } = render(<App />);
    await wait(1300);
    await typeLine(stdin, "/build review my code for bugs");
    await until(() => /MANUAL CONFIRMATION REQUIRED/.test(lastFrame() ?? ""), 6000);
    expect(lastFrame()).toMatch(/\[Y\] Approve/);
    await wait(200);
    stdin.write("y");
    await until(() => /built agent/.test(lastFrame() ?? ""), 10000);
  }, 25000);

  it("N cancels a pending manual confirm", async () => {
    const { lastFrame, stdin } = render(<App />);
    await wait(1300);
    await typeLine(stdin, "/build a quick helper");
    await until(() => /MANUAL CONFIRMATION REQUIRED/.test(lastFrame() ?? ""), 6000);
    await wait(200);
    stdin.write("n");
    await until(() => /cancelled/.test(lastFrame() ?? "") && !/MANUAL CONFIRMATION/.test(lastFrame() ?? ""), 6000);
  }, 20000);

  it("F2 overlay → build → Y confirm generates the agent", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /AUTOMATION & LOG STREAM/.test(lastFrame() ?? ""));
    await wait(800);
    stdin.write("OQ"); // F2
    await until(() => /AGENT TOOLKIT/.test(lastFrame() ?? ""), 4000);
    await wait(200);
    stdin.write("\r"); // Create Custom Agent → overlay
    await until(() => /Agent Goal:/.test(lastFrame() ?? ""), 4000);
    await wait(200);
    await typeLine(stdin, "frontend dev");
    await until(() => /MANUAL CONFIRMATION REQUIRED/.test(lastFrame() ?? ""), 6000);
    await wait(200);
    stdin.write("y");
    await until(() => /frontend-dev/.test(lastFrame() ?? ""), 10000);
  }, 25000);
});

async function typeLine(stdin: { write: (s: string) => void }, s: string): Promise<void> {
  for (const ch of s) {
    stdin.write(ch);
    await wait(15);
  }
  await wait(120);
  stdin.write("\r");
}
