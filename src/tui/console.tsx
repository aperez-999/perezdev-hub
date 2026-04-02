import React, { useEffect, useRef, useState } from "react";
import { useApp, useInput, useStdin } from "ink";
import { Engine } from "../engine/bridge.js";
import { detectOllama, promptModel, THINKING_SYSTEM, type OllamaStatus } from "../core/ollama.js";
import { resolveProvider, providerHint } from "../core/provider.js";
import { promptAnthropic, promptOpenAI } from "../core/cloud.js";
import { readIfExists } from "../util/fs-safe.js";
import {
  loadHome,
  installProposal,
  installDescribed,
  installCatalogMcp,
  engineMap,
  engineDiagnose,
  catalogMcp,
  type HomeData,
} from "./data.js";
import { slugSchema } from "../core/agent-spec.js";
import {
  type Autonomy,
  type LogKind,
  type LogLine,
  type Mode,
  type Thinking,
} from "./components.js";
import { Shell, Footer, type Page } from "./shell.js";
import { ChatPage } from "./pages/chat.js";
import { FactoryPage, FACTORY_ITEMS } from "./pages/factory.js";
import { McpPage } from "./pages/mcp.js";

interface Overlay {
  kind: "build" | "diagnose";
  prompt: string;
  value: string;
}

/** Function-key escape sequences Ink's useInput swallows; parsed off raw stdin. */
function fkey(data: string): Page | null {
  if (data === "OP" || data === "[11~" || data === "[[A") return 1;
  if (data === "OQ" || data === "[12~" || data === "[[B") return 2;
  if (data === "OR" || data === "[13~" || data === "[[C") return 3;
  return null;
}

/** The whole UI: tabbed OpenDev-style console (Chat · Skill Builder · MCP). */
export function Console({ gradient }: { gradient: string }): React.ReactElement {
  const { exit } = useApp();
  const { stdin } = useStdin();
  const engineRef = useRef<Engine | null>(null);
  const [home, setHome] = useState<HomeData | null>(null);
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [input, setInput] = useState("");
  const [partial, setPartial] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("normal");
  const [autonomy, setAutonomy] = useState<Autonomy>("manual");
  const [thinking, setThinking] = useState<Thinking>("medium");
  const [page, setPage] = useState<Page>(1);
  const [sel2, setSel2] = useState(0);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [skills, setSkills] = useState<string[] | null>(null);
  const pending = useRef<{ desc: string; run: () => Promise<string> } | null>(null);

  const push = (kind: LogKind, text: string) => setLog((l) => [...l, { kind, text }].slice(-200));

  async function refresh(): Promise<HomeData> {
    const h = await loadHome();
    setHome(h);
    return h;
  }

  useEffect(() => {
    engineRef.current = new Engine();
    push("info", "Connecting to local Ollama API instance...");
    void refresh();
    detectOllama(engineRef.current).then((s) => {
      setStatus(s);
      const p = resolveProvider(s);
      if (s.available && s.normal) push("ok", `Detected models: ${s.normal} (Normal), ${s.thinking ?? s.normal} (Think)`);
      else if (p.kind === "cloud") push("ok", `No local models — using cloud: ${p.label}`);
      else push("info", providerHint(p));
      push("info", "Type a prompt, or /help for commands.  F1-F3 switch pages.");
    });
    return () => engineRef.current?.close();
  }, []);

  // Function keys are stripped by Ink's useInput, so route them off raw stdin.
  useEffect(() => {
    if (!stdin) return;
    const onData = (d: Buffer | string) => {
      const p = fkey(typeof d === "string" ? d : d.toString("utf8"));
      if (p) goto(p);
    };
    stdin.on("data", onData);
    return () => {
      stdin.off("data", onData);
    };
  }, [stdin]);

  const provider = status ? resolveProvider(status, mode === "plan" ? "thinking" : "normal") : null;
  const targets = home?.targets ?? [];

  function goto(p: Page): void {
    setOverlay(null);
    setSkills(null);
    setPage(p);
  }

  useInput((ch, key) => {
    // Global toggles work on every page, even mid-task.
    if (key.tab && key.shift) return setMode((m) => (m === "normal" ? "plan" : "normal"));
    if (key.ctrl && ch === "a") return setAutonomy((a) => (a === "manual" ? "auto" : "manual"));
    if (key.ctrl && ch === "t") return setThinking((t) => (t === "low" ? "medium" : t === "medium" ? "high" : "low"));

    if (key.escape) {
      if (overlay) return setOverlay(null);
      if (skills) return setSkills(null);
      return goto(1);
    }
    if (busy) return;

    // Digit page-switch only off the chat page (page 1 keeps digits for typing).
    if (page !== 1 && !overlay && (ch === "1" || ch === "2" || ch === "3")) {
      return goto(Number(ch) as Page);
    }

    if (page === 2 && !overlay) {
      if (key.upArrow) return setSel2((s) => (s + FACTORY_ITEMS.length - 1) % FACTORY_ITEMS.length);
      if (key.downArrow) return setSel2((s) => (s + 1) % FACTORY_ITEMS.length);
      if (key.return) return activateFactory(sel2);
    }
    if (page === 3 && !overlay && key.return) {
      return discoverMcp();
    }
  });

  /** Run a mutating action now (auto) or queue it for /yes (manual). */
  async function guard(desc: string, run: () => Promise<string>): Promise<void> {
    if (autonomy === "auto") {
      await execute(run);
    } else {
      pending.current = { desc, run };
      push("info", `⚠ Manual mode — type /yes to apply: ${desc}`);
    }
  }

  async function execute(run: () => Promise<string>): Promise<void> {
    setBusy(true);
    try {
      push("ok", await run());
    } catch (err) {
      push("err", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function buildAgent(desc: string): Promise<void> {
    const name = slugify(desc);
    return guard(`build agent ${name} → ${targets.join(", ")}`, async () => {
      await installDescribed(name, desc, targets);
      await refresh();
      return `built agent ${name} (.md skill across ${targets.length} tool(s))`;
    });
  }

  async function diagnose(file: string): Promise<void> {
    setBusy(true);
    try {
      const d = await engineDiagnose(file);
      push("err", `${d.kind}: ${d.message}`);
      push("ok", `→ ${d.hint}`);
      d.frames.forEach((f) => push("info", `  ${f.file}:${f.line}`));
    } catch (e) {
      push("err", e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function discoverMcp(): Promise<void> {
    const h = home ?? (await refresh());
    const ids = new Set<string>();
    if (h.scan.git) {
      ids.add("git");
      ids.add("github");
    }
    if (h.scan.databases.includes("postgres")) ids.add("postgres");
    if (h.scan.databases.includes("sqlite")) ids.add("sqlite");
    const servers = [...ids]
      .map((id) => catalogMcp.find((m) => m.id === id))
      .filter((s): s is NonNullable<typeof s> => !!s);
    if (servers.length === 0) return push("info", "no MCP servers inferred for this workspace");
    push("info", `discovered: ${servers.map((s) => s.id).join(", ")}`);
    return guard(`inject ${servers.length} MCP server(s) → ${targets.join(", ")}`, async () => {
      for (const s of servers) await installCatalogMcp(s, targets);
      await refresh();
      return `injected ${servers.map((s) => s.id).join(", ")}`;
    });
  }

  function activateFactory(index: number): void {
    if (index === 0) return setOverlay({ kind: "build", prompt: "Agent Goal:", value: "" });
    if (index === 1) return setOverlay({ kind: "diagnose", prompt: "Log file:", value: "" });
    const h = home;
    const list = [
      ...(h?.agents ?? []).map((a) => `${a.name}  (${a.targets.join("/")} · v${a.version})`),
      ...(h?.mcp ?? []).map((m) => `mcp:${m.id}  (${m.targets.join("/")})`),
    ];
    setSkills(list);
  }

  function onOverlaySubmit(value: string): void {
    const o = overlay;
    setOverlay(null);
    const v = value.trim();
    if (!o || !v) return;
    if (o.kind === "build") void buildAgent(v);
    else void diagnose(v);
  }

  async function submit(raw: string): Promise<void> {
    const text = raw.trim();
    setInput("");
    if (!text || busy) return;
    if (text.startsWith("/")) return slash(text);
    push("user", text);
    await runPrompt(text);
  }

  async function slash(text: string): Promise<void> {
    const [cmd, ...rest] = text.slice(1).split(/\s+/);
    const arg = rest.join(" ");
    if (cmd === "quit" || cmd === "exit") return exit();
    if (cmd === "clear") return setLog([]);
    if (cmd === "help") {
      [
        "commands:",
        "  <prompt>        ask the local model (Shift+Tab = planning)",
        "  @file <prompt>  inject a file's contents as context",
        "  F1/F2/F3        chat · skill builder · mcp manager pages",
        "  /build <desc>   /create <name>: <purpose>",
        "  /mcp auto · /pull <model> · /tree [dir] · /diagnose <file>",
        "  /recommend · /install <name> · /models · /list",
        "  /yes apply pending · Ctrl+A autonomy · Ctrl+T thinking · /quit",
      ].forEach((l) => push("info", l));
      return;
    }
    if (cmd === "yes") {
      const p = pending.current;
      pending.current = null;
      if (p) await execute(p.run);
      else push("info", "nothing pending");
      return;
    }
    if (cmd === "models") {
      const s = await detectOllama(engineRef.current!);
      setStatus(s);
      push("info", s.models.length ? s.models.join(", ") : "no local models pulled");
      return;
    }
    if (cmd === "list") {
      const h = home ?? (await refresh());
      if (h.agents.length === 0 && h.mcp.length === 0) push("info", "nothing installed");
      h.agents.forEach((a) => push("ok", `agent ${a.name}  (${a.targets.join(", ")} v${a.version})`));
      h.mcp.forEach((m) => push("ok", `mcp   ${m.id}  (${m.targets.join(", ")})`));
      return;
    }
    if (cmd === "recommend") {
      setBusy(true);
      const h = await refresh();
      setBusy(false);
      if (h.proposals.length === 0 && h.mcpSuggestions.length === 0) return push("info", "you're fully set up");
      h.proposals.forEach((p) => push("info", `agent ${p.name} — ${p.reason}`));
      h.mcpSuggestions.forEach((m) => push("info", `mcp ${m.server.id} — ${m.reason}`));
      push("info", "install with /install <name>");
      return;
    }
    if (cmd === "install") {
      const h = home ?? (await refresh());
      const prop = h.proposals.find((p) => p.name === arg);
      const sug = h.mcpSuggestions.find((m) => m.server.id === arg) ?? catalogMcp.find((m) => m.id === arg);
      if (prop) return guard(`install agent ${prop.name} → ${targets.join(", ")}`, async () => {
        await installProposal(prop, targets);
        await refresh();
        return `installed agent ${prop.name}`;
      });
      if (sug) {
        const server = "server" in sug ? sug.server : sug;
        return guard(`install mcp ${server.id}`, async () => {
          await installCatalogMcp(server, targets);
          await refresh();
          return `installed mcp ${server.id}`;
        });
      }
      return push("err", `unknown suggestion '${arg}' — run /recommend`);
    }
    if (cmd === "create") {
      const m = arg.match(/^(\S+)\s*:\s*(.+)$/);
      if (!m || !slugSchema.safeParse(m[1]).success) return push("err", "usage: /create <kebab-name>: <purpose>");
      const [, name, purpose] = m;
      return guard(`create agent ${name} → ${targets.join(", ")}`, async () => {
        await installDescribed(name!, purpose!, targets);
        await refresh();
        return `created agent ${name}`;
      });
    }
    if (cmd === "build") {
      if (!arg) return push("err", "usage: /build <describe the agent>");
      return buildAgent(arg);
    }
    if (cmd === "mcp") {
      const sub = rest[0] ?? "";
      if (sub === "auto" || sub === "discover") return discoverMcp();
      const server = catalogMcp.find((m) => m.id === sub);
      if (server) {
        return guard(`install mcp ${server.id}`, async () => {
          await installCatalogMcp(server, targets);
          await refresh();
          return `installed mcp ${server.id}`;
        });
      }
      return push("err", "usage: /mcp auto  |  /mcp <id>");
    }
    if (cmd === "map" || cmd === "tree") {
      setBusy(true);
      try {
        const r = await engineMap(arg || ".", 2);
        r.tree.split("\n").slice(0, 30).forEach((l) => push("info", l));
      } catch (e) {
        push("err", e instanceof Error ? e.message : String(e));
      }
      setBusy(false);
      return;
    }
    if (cmd === "pull") {
      if (!arg) return push("err", "usage: /pull <model>  (e.g. /pull qwen2.5-coder)");
      setBusy(true);
      setPartial("");
      push("info", `pulling ${arg}...`);
      try {
        await engineRef.current!.send("ollama_pull", { model: arg }, 3_600_000, (t) => setPartial(t));
        const s = await detectOllama(engineRef.current!);
        setStatus(s);
        push("ok", `pulled ${arg} — now available`);
      } catch (e) {
        push("err", e instanceof Error ? e.message : String(e));
      }
      setPartial("");
      setBusy(false);
      return;
    }
    if (cmd === "fix" || cmd === "diagnose") {
      if (!arg) return push("err", "usage: /fix <logfile>");
      return diagnose(arg);
    }
    push("err", `unknown command: /${cmd}  (try /help)`);
  }

  async function runPrompt(text: string): Promise<void> {
    if (!provider || provider.kind === "none") {
      return push("err", providerHint(provider ?? { kind: "none", label: "", status: "", reason: "offline" }));
    }
    const prompt = await resolveContext(text);
    const system = mode === "plan" ? THINKING_SYSTEM : undefined;
    const onToken = (t: string) => setPartial((p) => p + t);
    setBusy(true);
    setPartial("");
    try {
      let full: string;
      if (provider.kind === "local") {
        full = await promptModel(engineRef.current!, provider.model, prompt, { system, onToken });
      } else if (provider.vendor === "anthropic") {
        full = await promptAnthropic(provider.model, prompt, { system, onToken });
      } else {
        full = await promptOpenAI(provider.model, prompt, { system, onToken });
      }
      push("ai", full.trim() || "(empty response)");
    } catch (err) {
      push("err", err instanceof Error ? err.message : String(err));
    } finally {
      setPartial("");
      setBusy(false);
    }
  }

  const staging = log.filter((l) => /mcp|inject|discover|server|github/i.test(l.text));
  const footer = (
    <Footer label={provider?.label ?? "no-model"} status={provider?.status ?? "..."} autonomy={autonomy} thinking={thinking} />
  );
  return (
    <Shell page={page} gradient={gradient} footer={footer}>
      {page === 1 && (
        <ChatPage
          home={home}
          status={status}
          log={log}
          busy={busy}
          partial={partial}
          mode={mode}
          input={input}
          setInput={setInput}
          submit={submit}
          inputActive={page === 1}
        />
      )}
      {page === 2 && (
        <FactoryPage
          sel={sel2}
          overlay={overlay}
          setOverlayValue={(v) => setOverlay((o) => (o ? { ...o, value: v } : o))}
          onOverlaySubmit={onOverlaySubmit}
          skills={skills}
        />
      )}
      {page === 3 && <McpPage home={home} staging={staging} busy={busy} />}
    </Shell>
  );
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .split("-")
      .slice(0, 3)
      .join("-")
      .slice(0, 40) || "agent"
  );
}

async function resolveContext(text: string): Promise<string> {
  const tokens = [...text.matchAll(/@(\S+)/g)].map((m) => m[1]!);
  if (tokens.length === 0) return text;
  const blocks: string[] = [];
  for (const path of tokens) {
    const content = await readIfExists(path);
    if (content !== null) blocks.push(`File ${path}:\n\`\`\`\n${content.slice(0, 6000)}\n\`\`\``);
  }
  const stripped = text.replace(/@(\S+)/g, "$1");
  return blocks.length ? `${blocks.join("\n\n")}\n\n${stripped}` : stripped;
}
