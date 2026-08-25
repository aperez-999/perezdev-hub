import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { App } from "../src/tui/app.js";
import { Intro } from "../src/tui/intro.js";
import { Setup, type SetupLanding } from "../src/tui/setup.js";
import { loadRc } from "../src/core/rc.js";

let home: string;
let cwd: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "pdh-tui-"));
  cwd = await mkdtemp(join(tmpdir(), "pdh-proj-"));
  await writeFile(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "18" } }));
  process.env.HOME = home;
  delete process.env.XDG_CONFIG_HOME;
  // Pin to an unreachable Ollama + no cloud keys so UI tests are deterministic
  // regardless of whether a model is running on the dev machine.
  process.env.OLLAMA_HOST = "http://127.0.0.1:1";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
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
const SHIFT_RIGHT = ESC + "[1;2C";
const SHIFT_LEFT = ESC + "[1;2D";
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
  it("renders the workbench shell: header, chat, and compact status", async () => {
    const { lastFrame } = render(<App />);
    await until(() => /PEREZDEV HUB/.test(lastFrame() ?? ""));
    const f = lastFrame() ?? "";
    expect(f).toMatch(/PEREZDEV HUB/);
    expect(f).toMatch(/v0\.2\.0/);
    expect(f).toMatch(/ Chat /);
    expect(f).toMatch(/Ask anything about this repo/);
    expect(f).not.toMatch(/ENVIRONMENT/);
    expect(f).toMatch(/manual/);
  });

  it("runs the /help slash command into the log stream", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /PEREZDEV HUB/.test(lastFrame() ?? ""));
    await wait(1000); // let the engine/ollama detect settle
    await typeLine(stdin, "/help");
    await until(() => /commands:/.test(lastFrame() ?? ""), 6000);
    // /help is generated from the command registry — assert a known command shows.
    expect(lastFrame()).toMatch(/\/build/);
  });

  it("shows the slash autocomplete menu when the input starts with /", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /PEREZDEV HUB/.test(lastFrame() ?? ""));
    await wait(800);
    for (const ch of "/mc") {
      stdin.write(ch);
      await wait(20);
    }
    await until(() => /\/mcp/.test(lastFrame() ?? ""), 4000);
  }, 15000);

  it("switches pages with function keys and Escape", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /PEREZDEV HUB/.test(lastFrame() ?? ""));
    await wait(800);
    stdin.write("OQ"); // F2
    await until(() => /Describe the agent/.test(lastFrame() ?? ""), 4000);
    expect(lastFrame()).toMatch(/Describe the agent/);
    stdin.write("OR"); // F3
    await until(() => /Local Filesystem/.test(lastFrame() ?? ""), 4000);
    expect(lastFrame()).toMatch(/Discover from repo/);
    stdin.write(ESC); // Escape -> back to chat
    await until(() => /PEREZDEV HUB/.test(lastFrame() ?? ""), 4000);
  }, 15000);

  it("restores the last active tab from ~/.perezdevrc on boot", async () => {
    await writeFile(
      join(home, ".perezdevrc"),
      JSON.stringify({ last_active_tab: 3, autonomy_mode: "auto", mcp_ignored_servers: [] }),
    );
    const { lastFrame } = render(<App />);
    await until(() => /Local Filesystem/.test(lastFrame() ?? ""), 4000);
    expect(lastFrame()).toMatch(/AUTO/);
  }, 15000);

  it("F3 shows the industry MCP directory and custom prompt field", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /PEREZDEV HUB/.test(lastFrame() ?? ""));
    await wait(800);
    stdin.write(F3);
    await until(() => /Local Filesystem/.test(lastFrame() ?? ""), 4000);
    const f = lastFrame() ?? "";
    expect(f).toMatch(/Local Filesystem/);
    expect(f).toMatch(/PostgreSQL Database/);
    expect(f).toMatch(/Git/);
    expect(f).toMatch(/HTTP Fetch/);
    expect(f).toMatch(/Discover from repo/);
    expect(f).toMatch(/custom server/);
  }, 15000);

  it("F3 Enter on a directory item pops an install confirm with a diff", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /PEREZDEV HUB/.test(lastFrame() ?? ""));
    await wait(800);
    stdin.write(F3);
    await until(() => /Local Filesystem/.test(lastFrame() ?? ""), 4000);
    await wait(200);
    stdin.write("\r"); // install the highlighted (first) item
    await until(() => /install mcp filesystem/.test(lastFrame() ?? ""), 6000);
    expect(lastFrame()).toMatch(/Write these files/);
  }, 15000);

  it("opens the Skill Builder with goal field and live preview on F2", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /PEREZDEV HUB/.test(lastFrame() ?? ""));
    await wait(800);
    stdin.write("OQ"); // F2
    await until(() => /Describe the agent/.test(lastFrame() ?? ""), 4000);
    const f = lastFrame() ?? "";
    expect(f).toMatch(/Install into/);
    expect(f).toMatch(/preview/);
  }, 15000);

  it("/build pops an inline manual confirm and applies on Y", async () => {
    const { lastFrame, stdin } = render(<App />);
    await wait(1300);
    await typeLine(stdin, "/build review my code for bugs");
    await until(() => /Write these files/.test(lastFrame() ?? ""), 6000);
    expect(lastFrame()).toMatch(/\[Y\] Approve/);
    await wait(200);
    stdin.write("y");
    await until(() => /built agent/.test(lastFrame() ?? ""), 10000);
  }, 25000);

  it("N cancels a pending manual confirm", async () => {
    const { lastFrame, stdin } = render(<App />);
    await wait(1300);
    await typeLine(stdin, "/build a quick helper");
    await until(() => /Write these files/.test(lastFrame() ?? ""), 6000);
    await wait(200);
    stdin.write("n");
    await until(() => /cancelled/.test(lastFrame() ?? "") && !/Write these files/.test(lastFrame() ?? ""), 6000);
  }, 20000);

  it("F2 Skill Builder: typing a goal + Enter generates the agent", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /PEREZDEV HUB/.test(lastFrame() ?? ""));
    await wait(800);
    stdin.write("OQ"); // F2 → goal field is focused by default
    await until(() => /Describe the agent/.test(lastFrame() ?? ""), 4000);
    await wait(200);
    await typeLine(stdin, "frontend dev");
    await until(() => /Write these files/.test(lastFrame() ?? ""), 6000);
    await wait(200);
    stdin.write("y");
    await until(() => /frontend-dev/.test(lastFrame() ?? ""), 10000);
  }, 25000);

  it("? on an empty Chat prompt opens help and Esc returns to Chat", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /PEREZDEV HUB/.test(lastFrame() ?? ""));
    await wait(800);
    stdin.write("?");
    await until(() => /SLASH COMMANDS/.test(lastFrame() ?? ""), 4000);
    expect(lastFrame()).toMatch(/KEYS/);
    expect(lastFrame()).toMatch(/This help \(empty prompt\)/);
    await wait(200);
    stdin.write(ESC);
    await until(() => !/SLASH COMMANDS/.test(lastFrame() ?? "") && /Ask anything about this repo/.test(lastFrame() ?? ""), 4000);
    expect(lastFrame()).not.toMatch(/› \?/);
  }, 15000);

  it("? opens the help overlay from MCP and Esc closes it", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /PEREZDEV HUB/.test(lastFrame() ?? ""));
    await wait(800);
    stdin.write(F3);
    await until(() => /Local Filesystem/.test(lastFrame() ?? ""), 4000);
    await wait(200);
    stdin.write("?");
    await until(() => /SLASH COMMANDS/.test(lastFrame() ?? ""), 4000);
    expect(lastFrame()).toMatch(/KEYS/);
    await wait(200);
    stdin.write(ESC);
    await until(() => !/SLASH COMMANDS/.test(lastFrame() ?? "") && /Local Filesystem/.test(lastFrame() ?? ""), 4000);
  }, 15000);

  it("renders four page tabs without numbered chrome or a header nav hint", async () => {
    const { lastFrame } = render(<App />);
    await until(() => /PEREZDEV HUB/.test(lastFrame() ?? ""));
    const f = lastFrame() ?? "";
    expect(f).toMatch(/ Chat /);
    expect(f).toMatch(/ Skills /);
    expect(f).toMatch(/ MCP /);
    expect(f).toMatch(/ News /);
    expect(f).not.toMatch(/1 Chat/);
    expect(f).not.toMatch(/2 Skills/);
    expect(f).not.toMatch(/3 MCP/);
    expect(f).not.toMatch(/⇄/);
  });

  it("Shift+←/→ cycles pages and wraps at the ends", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /PEREZDEV HUB/.test(lastFrame() ?? ""));
    await wait(800);
    stdin.write(SHIFT_LEFT); // page 1 → wrap to page 4 News
    await until(() => /AI tooling feed/.test(lastFrame() ?? ""), 4000);
    stdin.write(SHIFT_RIGHT); // page 4 → wrap to page 1
    await until(() => /PEREZDEV HUB/.test(lastFrame() ?? ""), 4000);
    stdin.write(SHIFT_RIGHT); // page 1 → page 2
    await until(() => /Describe the agent/.test(lastFrame() ?? ""), 4000);
  }, 15000);

  it("digit keys 1-3 jump pages when not typing", async () => {
    const { lastFrame, stdin } = render(<App />);
    await until(() => /PEREZDEV HUB/.test(lastFrame() ?? ""));
    await wait(800);
    stdin.write(F3); // leave the chat input so single-key nav applies
    await until(() => /Local Filesystem/.test(lastFrame() ?? ""), 4000);
    await wait(150);
    stdin.write("2");
    await until(() => /Describe the agent/.test(lastFrame() ?? ""), 4000);
  }, 15000);
});

describe("Intro splash", () => {
  it("holds on the enter hint until a key is pressed", async () => {
    let done = 0;
    const { lastFrame, stdin } = render(<Intro onDone={() => (done += 1)} />);
    await until(() => /press . to continue/.test(lastFrame() ?? ""), 6000);
    expect(lastFrame()).not.toMatch(/QUICK START/);
    expect(lastFrame()).not.toMatch(/scanning your environment/);
    await wait(700);
    expect(done).toBe(0);
    stdin.write("\r");
    await until(() => done === 1, 2000);
  }, 12000);
});

describe("first-run Setup", () => {
  const snap = {
    tools: [
      { id: "cursor" as const, name: "Cursor", present: true },
      { id: "claude-code" as const, name: "Claude Code", present: false },
    ],
    ollama: { up: true, model: "llama3" },
    git: false,
  };

  it("shows write-targets and skip writes setup_complete", async () => {
    const landing: { current: SetupLanding | null } = { current: null };
    const { lastFrame, stdin } = render(<Setup snapshot={snap} onDone={(r) => (landing.current = r)} />);
    await wait(150);
    expect(lastFrame()).toMatch(/write skills into/);
    expect(lastFrame()).toMatch(/Cursor/);
    expect(lastFrame()).toMatch(/Claude Code/);
    expect(lastFrame()).toMatch(/missing/);
    stdin.write(ESC);
    await until(() => landing.current !== null);
    expect(landing.current?.pack).toBe("empty");
    const rc = await loadRc();
    expect(rc.setup_complete).toBe(true);
    expect(rc.default_targets).toEqual(["cursor"]);
  });

  it("shows the official install command for a missing selected tool", async () => {
    const { lastFrame, stdin } = render(<Setup snapshot={snap} onDone={() => {}} />);
    await wait(150);
    expect(lastFrame()).toMatch(/write skills into/);
    stdin.write(ESC + "[B");
    await wait(80);
    stdin.write(" ");
    await wait(80);
    stdin.write("\r");
    await until(() => /npm install -g @anthropic-ai\/claude-code/.test(lastFrame() ?? ""), 4000);
    expect(lastFrame()).toMatch(/will not run this/i);
  }, 12000);
});

async function typeLine(stdin: { write: (s: string) => void }, s: string): Promise<void> {
  for (const ch of s) {
    stdin.write(ch);
    await wait(15);
  }
  await wait(120);
  stdin.write("\r");
}
