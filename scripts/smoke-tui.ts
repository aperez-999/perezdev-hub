/**
 * Visual smoke: render intro / setup / hub / news frames with ink-testing-library.
 * Run: npx tsx scripts/smoke-tui.ts
 */
import React from "react";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { Intro } from "../src/tui/intro.js";
import { Setup } from "../src/tui/setup.js";
import { Console } from "../src/tui/console.js";
import { NewsPage } from "../src/tui/pages/news.js";
import { fetchNews, clearNewsCache } from "../src/core/news.js";
import { fetchSuperpowersSkills } from "../src/core/superpowers.js";
import { detectAll } from "../src/adapters/registry.js";
import { probeOllama } from "../src/core/setup.js";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function dump(label: string, frame: string | undefined): void {
  console.log("\n======== " + label + " ========");
  console.log(frame ?? "(empty)");
}

async function main(): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "pdh-smoke-"));
  const prevHome = process.env.HOME;
  process.env.HOME = home;
  delete process.env.XDG_CONFIG_HOME;
  process.env.PDH_NO_ALT = "1";

  const intro = render(React.createElement(Intro, { onDone: () => {} }));
  await wait(900);
  dump("INTRO (after typewriter)", intro.lastFrame());
  intro.unmount();

  const snap = {
    tools: [
      { id: "cursor" as const, name: "Cursor", present: true },
      { id: "claude-code" as const, name: "Claude Code", present: false },
      { id: "copilot" as const, name: "GitHub Copilot", present: false },
      { id: "codex" as const, name: "Codex", present: false },
      { id: "cline" as const, name: "Cline", present: false },
      { id: "windsurf" as const, name: "Windsurf", present: false },
      { id: "roo" as const, name: "Roo", present: false },
    ],
    ollama: { up: true, model: "llama3:latest" },
    git: true,
  };
  const setup = render(React.createElement(Setup, { snapshot: snap, onDone: () => {} }));
  await wait(120);
  dump("SETUP targets", setup.lastFrame());
  setup.stdin.write("\r");
  await wait(80);
  dump("SETUP pack (git repo → after targets, no missing selected)", setup.lastFrame());
  setup.unmount();

  const setup2 = render(React.createElement(Setup, { snapshot: snap, onDone: () => {} }));
  await wait(80);
  setup2.stdin.write("\x1b[B");
  await wait(40);
  setup2.stdin.write(" ");
  await wait(40);
  setup2.stdin.write("\r");
  await wait(80);
  dump("SETUP missing (Claude Code selected)", setup2.lastFrame());
  setup2.unmount();

  process.env.HOME = prevHome;

  process.env.VITEST = "1";
  process.env.PDH_NO_INTRO = "1";
  const hubHome = await mkdtemp(join(tmpdir(), "pdh-smoke-hub-"));
  process.env.HOME = hubHome;
  const hub = render(React.createElement(Console));
  await wait(700);
  dump("HUB chat", hub.lastFrame());
  hub.unmount();
  await rm(hubHome, { recursive: true, force: true });
  delete process.env.VITEST;
  delete process.env.PDH_NO_INTRO;

  process.env.PDH_TEST_NEWS = "1";
  process.env.VITEST = "1";
  clearNewsCache();
  const news = render(React.createElement(NewsPage, { sel: 0 }));
  await wait(200);
  dump("NEWS (test fixture)", news.lastFrame());
  news.unmount();
  delete process.env.PDH_TEST_NEWS;
  delete process.env.VITEST;
  clearNewsCache();

  console.log("\n======== LIVE NEWS ========");
  const live = await fetchNews();
  console.log("live=", live.live, "count=", live.items.length);
  console.log(live.items.slice(0, 8).map((i) => `${i.source}\t${i.title}`).join("\n"));

  console.log("\n======== DETECT (this machine) ========");
  process.env.HOME = prevHome;
  const [detected, ollama] = await Promise.all([detectAll(), probeOllama()]);
  for (const d of detected) console.log(`${d.detection.installed ? "●" : "○"} ${d.adapter.displayName}  ${d.detection.detail}`);
  console.log(`Ollama ${ollama.up ? "up" : "down"}${ollama.model ? " · " + ollama.model : ""}`);

  console.log("\n======== SUPERPOWERS FETCH ========");
  const pack = await fetchSuperpowersSkills();
  console.log("skills=", pack.skills.length, pack.error ?? "ok");
  if (pack.skills[0]) console.log("first=", pack.skills[0].name, pack.skills[0].description.slice(0, 80));

  process.env.HOME = prevHome;
  await rm(home, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
