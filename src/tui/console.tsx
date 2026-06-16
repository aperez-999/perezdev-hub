import React, { useEffect, useRef, useState } from "react";
import { useApp, useInput, useStdin } from "ink";
import { Engine } from "../engine/bridge.js";
import { detectOllama, promptModel, THINKING_SYSTEM, type OllamaStatus } from "../core/ollama.js";
import { resolveProvider, providerHint } from "../core/provider.js";
import { promptAnthropic, promptOpenAI } from "../core/cloud.js";
import { readIfExists, applyEdits, cacheBackup, atomicWriteValidated, withRollback } from "../util/fs-safe.js";
import { runAutofix, inferVerifyCommand } from "../core/autofix.js";
import { runCommand } from "../core/exec.js";
import {
  loadHome,
  installProposal,
  installDescribed,
  installCatalogMcp,
  installCustomMcp,
  engineMap,
  engineDiagnose,
  catalogMcp,
  type HomeData,
} from "./data.js";
import { slugSchema } from "../core/agent-spec.js";
import { skillMetaprompt, mcpMetaprompt, parseMcpConfig } from "../core/metaprompt.js";
import type { Provider } from "../core/provider.js";
import { loadRc, saveRc } from "../core/rc.js";
import {
  ConfirmBox,
  type Autonomy,
  type LogKind,
  type LogLine,
  type Mode,
  type PendingConfirm,
  type Thinking,
} from "./components.js";
import { Shell, Footer, type Page } from "./shell.js";
import { ChatPage } from "./pages/chat.js";
import { FactoryPage, FACTORY_ITEMS } from "./pages/factory.js";
import { McpPage, MCP_DIRECTORY, type McpFocus } from "./pages/mcp.js";

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
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [sel3, setSel3] = useState(0);
  const [focus3, setFocus3] = useState<McpFocus>("list");
  const [mcpInput, setMcpInput] = useState("");
  const [ignored, setIgnored] = useState<string[]>([]);
  const rcLoaded = useRef(false);

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

  // Restore persisted preferences (~/.perezdevrc): last tab, autonomy, ignored servers.
  useEffect(() => {
    void loadRc().then((rc) => {
      setPage(rc.last_active_tab);
      setAutonomy(rc.autonomy_mode);
      setIgnored(rc.mcp_ignored_servers);
      rcLoaded.current = true;
    });
  }, []);

  // Persist preferences whenever they change (after the initial load). Best-effort.
  useEffect(() => {
    if (!rcLoaded.current) return;
    void saveRc({ last_active_tab: page, autonomy_mode: autonomy, mcp_ignored_servers: ignored }).catch(() => {});
  }, [page, autonomy, ignored]);

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
      if (confirm) return cancelConfirm();
      if (overlay) return setOverlay(null);
      if (skills) return setSkills(null);
      return goto(1);
    }

    // A pending confirm captures Y/N exclusively — every other key is swallowed
    // so letters/digits can't leak into tab switching or background menus.
    if (confirm) {
      if (ch === "y" || ch === "Y") approveConfirm();
      else if (ch === "n" || ch === "N") cancelConfirm();
      return;
    }

    // While the goal/log overlay is open the TextInput owns typing; freeze nav.
    if (overlay) return;

    // Page 3 — Tab cycles focus across directory / button / prompt field.
    if (page === 3) {
      if (key.tab && !key.shift) {
        return setFocus3((f) => (f === "list" ? "button" : f === "button" ? "input" : "list"));
      }
      if (focus3 === "input") return; // custom-prompt field owns every other key
      if (busy) return;
      if (ch === "1" || ch === "2") return goto(Number(ch) as Page);
      if (focus3 === "list") {
        if (key.upArrow) return setSel3((s) => (s + MCP_DIRECTORY.length - 1) % MCP_DIRECTORY.length);
        if (key.downArrow) return setSel3((s) => (s + 1) % MCP_DIRECTORY.length);
        if (key.return) return installDirectory(sel3);
      }
      if (focus3 === "button" && key.return) return void discoverMcp();
      return;
    }

    if (busy) return;

    // Digit page-switch only off the chat page (page 1 keeps digits for typing).
    if (page === 2 && (ch === "1" || ch === "2" || ch === "3")) {
      return goto(Number(ch) as Page);
    }
    if (page === 2) {
      if (key.upArrow) return setSel2((s) => (s + FACTORY_ITEMS.length - 1) % FACTORY_ITEMS.length);
      if (key.downArrow) return setSel2((s) => (s + 1) % FACTORY_ITEMS.length);
      if (key.return) return activateFactory(sel2);
    }
  });

  /** Run a mutating action now (auto) or pop an inline Y/N confirm (manual). */
  async function guard(desc: string, run: () => Promise<string>, ignore?: string[]): Promise<void> {
    if (autonomy === "auto") {
      await execute(run);
    } else {
      setConfirm({ desc, run, ignore });
      push("info", `⚠ confirm needed: ${desc}  (Y approve / N cancel)`);
    }
  }

  function approveConfirm(): void {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.resolve) return c.resolve(true); // promise-style gate (e.g. autofix loop)
    setLog((l) => l.filter((x) => !/^⚠ confirm needed|^discovered:/i.test(x.text)));
    if (c.run) void execute(c.run);
  }

  function cancelConfirm(): void {
    const c = confirm;
    if (!c) return;
    setConfirm(null);
    if (c.resolve) return c.resolve(false);
    // Remember declined MCP servers so discovery won't re-prompt for them.
    if (c.ignore && c.ignore.length) {
      setIgnored((prev) => [...new Set([...prev, ...c.ignore!])]);
      push("info", `cancelled — won't suggest ${c.ignore.join(", ")} again`);
    } else {
      push("info", "cancelled");
    }
  }

  /** Promise-style confirm for the autofix loop; auto-approves in Autonomous mode. */
  function confirmAsync(desc: string): Promise<boolean> {
    if (autonomy === "auto") return Promise.resolve(true);
    return new Promise((resolve) => setConfirm({ desc, resolve }));
  }

  /** Report an install: summary line first (always visible), then a few short paths. */
  function reportInstall(summary: string, paths: string[]): void {
    push("ok", summary);
    const homeDir = process.env.HOME || "";
    const short = (p: string) => (homeDir && p.startsWith(homeDir) ? "~" + p.slice(homeDir.length) : p);
    paths.slice(0, 4).forEach((p) => push("info", `  → ${short(p)}`));
    if (paths.length > 4) push("info", `  → (+${paths.length - 4} more)`);
  }

  async function execute(run: () => Promise<string>): Promise<void> {
    setBusy(true);
    try {
      const r = await run();
      if (r) push("ok", r);
    } catch (err) {
      push("err", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  /** Route one prompt to the active provider (local Ollama or cloud), streaming tokens. */
  async function callProvider(
    prompt: string,
    onToken?: (t: string) => void,
    system?: string,
  ): Promise<string> {
    const p: Provider | null = provider;
    if (!p || p.kind === "none") {
      throw new Error(providerHint(p ?? { kind: "none", label: "", status: "", reason: "offline" }));
    }
    if (p.kind === "local") return promptModel(engineRef.current!, p.model, prompt, { system, onToken });
    if (p.vendor === "anthropic") return promptAnthropic(p.model, prompt, { system, onToken });
    return promptOpenAI(p.model, prompt, { system, onToken });
  }

  /** Generate a skill body with the active LLM (on request), then confirm + write. */
  async function buildAgent(desc: string): Promise<void> {
    const name = slugify(desc);
    let body: string | undefined;
    if (provider && provider.kind !== "none") {
      setBusy(true);
      setPartial("");
      push("info", "⠋ Querying active AI provider to generate custom skill instructions...");
      try {
        body = (await callProvider(skillMetaprompt(desc), (t) => setPartial((p) => p + t))).trim() || undefined;
      } catch (e) {
        push("err", e instanceof Error ? e.message : String(e));
      }
      setPartial("");
      setBusy(false);
    }
    if (!body) {
      push("info", "no model connected — wrote a template skill. Start Ollama or set a key for AI-generated.");
    }
    return guard(`build agent ${name} → ${targets.join(", ")}`, async () => {
      const paths = await installDescribed(name, desc, targets, body);
      await refresh();
      reportInstall(`built agent ${name} across ${targets.length} tool(s) · ${body ? "AI-generated" : "template"}`, paths);
      return "";
    });
  }

  /** Install a server picked from the industry directory. */
  function installDirectory(i: number): void {
    const item = MCP_DIRECTORY[i];
    if (!item) return;
    const server = catalogMcp.find((m) => m.id === item.id);
    if (!server) return push("err", `no catalog entry for ${item.id}`);
    void guard(`install mcp ${server.id} → ${targets.join(", ")}`, async () => {
      const paths = await installCatalogMcp(server, targets);
      await refresh();
      reportInstall(`installed mcp ${server.id} into ${paths.length} config(s)`, paths);
      return "";
    });
  }

  /** Compile a custom MCP config from a free-text request via the active LLM. */
  async function compileMcp(request: string): Promise<void> {
    const req = request.trim();
    setMcpInput("");
    if (!req) return;
    if (!provider || provider.kind === "none") {
      return push("err", providerHint(provider ?? { kind: "none", label: "", status: "", reason: "offline" }));
    }
    setBusy(true);
    setPartial("");
    push("info", `⠋ Querying active AI provider to compile MCP config: ${req}`);
    let parsed: { command: string; args: string[]; env: Record<string, string> };
    try {
      const raw = await callProvider(mcpMetaprompt(req), (t) => setPartial((p) => p + t));
      push("info", raw.trim().slice(0, 200));
      parsed = parseMcpConfig(raw);
    } catch (e) {
      setPartial("");
      setBusy(false);
      return push("err", e instanceof Error ? e.message : String(e));
    }
    setPartial("");
    setBusy(false);
    const id = slugify(req);
    push("ok", `${id}: ${parsed.command} ${parsed.args.join(" ")}`);
    return guard(`inject mcp ${id} → ${targets.join(", ")}`, async () => {
      const paths = await installCustomMcp(id, req, parsed, targets);
      await refresh();
      reportInstall(`injected mcp ${id} into ${paths.length} config(s)`, paths);
      return "";
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
      .filter((id) => !ignored.includes(id)) // skip servers the user already declined
      .map((id) => catalogMcp.find((m) => m.id === id))
      .filter((s): s is NonNullable<typeof s> => !!s);
    if (servers.length === 0) return push("info", "no new MCP servers inferred for this workspace");
    push("info", `discovered: ${servers.map((s) => s.id).join(", ")}`);
    const sids = servers.map((s) => s.id);
    return guard(
      `inject ${servers.length} MCP server(s) → ${targets.join(", ")}`,
      async () => {
        const paths = new Set<string>();
        for (const s of servers) (await installCatalogMcp(s, targets)).forEach((p) => paths.add(p));
        await refresh();
        reportInstall(`injected ${sids.join(", ")} into ${paths.size} config(s)`, [...paths]);
        return "";
      },
      sids,
    );
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
        "  /autofix <file> [| cmd]  diagnose then patch + verify in a loop",
        "  /recommend · /install <name> · /models · /list",
        "  /yes apply pending · Ctrl+A autonomy · Ctrl+T thinking · /quit",
      ].forEach((l) => push("info", l));
      return;
    }
    if (cmd === "yes") {
      if (confirm) approveConfirm();
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
        const paths = await installProposal(prop, targets);
        await refresh();
        reportInstall(`installed agent ${prop.name} across ${targets.length} tool(s)`, paths);
        return "";
      });
      if (sug) {
        const server = "server" in sug ? sug.server : sug;
        return guard(`install mcp ${server.id}`, async () => {
          const paths = await installCatalogMcp(server, targets);
          await refresh();
          reportInstall(`installed mcp ${server.id} into ${paths.length} config(s)`, paths);
          return "";
        });
      }
      return push("err", `unknown suggestion '${arg}' — run /recommend`);
    }
    if (cmd === "create") {
      const m = arg.match(/^(\S+)\s*:\s*(.+)$/);
      if (!m || !slugSchema.safeParse(m[1]).success) return push("err", "usage: /create <kebab-name>: <purpose>");
      const [, name, purpose] = m;
      return guard(`create agent ${name} → ${targets.join(", ")}`, async () => {
        const paths = await installDescribed(name!, purpose!, targets);
        await refresh();
        reportInstall(`created agent ${name} across ${targets.length} tool(s)`, paths);
        return "";
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
          const paths = await installCatalogMcp(server, targets);
          await refresh();
          reportInstall(`installed mcp ${server.id} into ${paths.length} config(s)`, paths);
          return "";
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
    if (cmd === "autofix") {
      const [file, override] = arg.split("|").map((s) => s.trim());
      if (!file) return push("err", "usage: /autofix <logfile> [| <verify command>]");
      return autofix(file, override);
    }
    push("err", `unknown command: /${cmd}  (try /help)`);
  }

  /** Diagnose a traceback, then run the gated auto-fix loop until it passes or caps out. */
  async function autofix(file: string, override?: string): Promise<void> {
    if (!provider || provider.kind === "none") {
      return push("err", providerHint(provider ?? { kind: "none", label: "", status: "", reason: "offline" }));
    }
    setBusy(true);
    try {
      const d = await engineDiagnose(file);
      if (d.frames.length === 0 && !d.hint) {
        push("err", "couldn't localize the error — need a traceback with a file/line or a known cause");
        return;
      }
      const verify = override || inferVerifyCommand(d, home?.scan);
      if (!verify) {
        push("err", "couldn't infer a verify command — pass one: /autofix <file> | <command>");
        return;
      }
      push("info", `${d.kind}: ${d.message}`);
      push("info", `verify command: ${verify}`);
      const result = await runAutofix(
        { diagnosis: d, verifyCommand: verify },
        {
          callProvider: (p) => callProvider(p),
          exec: (c) => runCommand(c, { cwd: process.cwd() }),
          readFile: (p) => readIfExists(p),
          applyPatch: async (target, edits) => {
            try {
              const cur = await readIfExists(target);
              if (cur === null) return { ok: false, error: `file not found: ${target}` };
              const next = applyEdits(cur, edits);
              const stamp = new Date().toISOString();
              await withRollback([target], stamp, async () => {
                await cacheBackup(target, stamp);
                await atomicWriteValidated(target, next);
              });
              return { ok: true };
            } catch (e) {
              return { ok: false, error: e instanceof Error ? e.message : String(e) };
            }
          },
          confirm: confirmAsync,
          log: (k, t) => push(k, t),
        },
      );
      push(
        result.status === "fixed" ? "ok" : "err",
        `autofix ${result.status} — ${result.attempts} attempt(s), ${result.changedFiles.length} file(s) changed`,
      );
      await refresh();
    } catch (e) {
      push("err", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runPrompt(text: string): Promise<void> {
    if (!provider || provider.kind === "none") {
      push("err", "chat unavailable — no model is connected");
      push("info", providerHint(provider ?? { kind: "none", label: "", status: "", reason: "offline" }));
      return;
    }
    const prompt = await resolveContext(text);
    const system = mode === "plan" ? THINKING_SYSTEM : undefined;
    setBusy(true);
    setPartial("");
    try {
      const full = await callProvider(prompt, (t) => setPartial((p) => p + t), system);
      push("ai", full.trim() || "(empty response)");
    } catch (err) {
      push("err", err instanceof Error ? err.message : String(err));
    } finally {
      setPartial("");
      setBusy(false);
    }
  }

  const staging = log.filter((l) => /mcp|inject|discover|server|github|compil|config|command|installed/i.test(l.text));
  const footer = (
    <Footer label={provider?.label ?? "no-model"} status={provider?.status ?? "..."} autonomy={autonomy} thinking={thinking} />
  );
  const hint = confirm
    ? "[Y] approve     [N] cancel"
    : overlay
      ? "[enter] submit     [esc] cancel"
      : page === 2
        ? "[↑↓] select     [enter] run     [F1-F3] page     [esc] chat"
        : page === 3
          ? "[tab] focus     [↑↓] select     [enter] go     [F1-F3] page     [esc] chat"
          : "[type] prompt / command     [shift+tab] plan     [ctrl+a] autonomy     [ctrl+t] thinking     [/help]";
  return (
    <Shell page={page} gradient={gradient} hint={hint} footer={footer} confirm={confirm ? <ConfirmBox desc={confirm.desc} /> : undefined}>
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
          inputActive={page === 1 && !confirm}
        />
      )}
      {page === 2 && (
        <FactoryPage
          sel={sel2}
          overlay={overlay}
          setOverlayValue={(v) => setOverlay((o) => (o ? { ...o, value: v } : o))}
          onOverlaySubmit={onOverlaySubmit}
          skills={skills}
          results={log
            .filter(
              (l) =>
                (l.kind === "ok" && /built |installed |created |injected /.test(l.text)) ||
                (l.kind === "info" && /^\s*→/.test(l.text)),
            )
            .slice(-6)
            .map((l) => l.text)}
          busy={busy}
        />
      )}
      {page === 3 && (
        <McpPage
          home={home}
          staging={staging}
          busy={busy}
          sel={sel3}
          focus={focus3}
          mcpInput={mcpInput}
          setMcpInput={setMcpInput}
          onMcpSubmit={compileMcp}
        />
      )}
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
