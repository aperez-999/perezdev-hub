import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdin } from "ink";
import { theme } from "./theme.js";
import { Engine } from "../engine/bridge.js";
import { detectOllama, promptModel, THINKING_SYSTEM, type OllamaStatus } from "../core/ollama.js";
import { resolveProvider, providerHint } from "../core/provider.js";
import { promptAnthropic, promptOpenAI } from "../core/cloud.js";
import { readIfExists, applyEdits, cacheBackup, atomicWriteValidated, withRollback } from "../util/fs-safe.js";
import { runAutofix, inferVerifyCommand } from "../core/autofix.js";
import { runCommand, runInstall } from "../core/exec.js";
import {
  loadHome,
  installProposal,
  installDescribed,
  installCatalogMcp,
  installCustomMcp,
  planDescribed,
  planCatalogMcp,
  plannedToDiff,
  engineMap,
  engineDiagnose,
  catalogMcp,
  type HomeData,
} from "./data.js";
import { slugSchema, type ToolId } from "../core/agent-spec.js";
import { skillMetaprompt, mcpMetaprompt, parseMcpConfig } from "../core/metaprompt.js";
import type { Provider } from "../core/provider.js";
import { loadRc, saveRc, type PerezRc } from "../core/rc.js";
import {
  ConfirmBox,
  type Autonomy,
  type LogCat,
  type LogKind,
  type LogLine,
  type Mode,
  type PendingConfirm,
  type Thinking,
} from "./components.js";
import { Shell, type Page } from "./shell.js";
import type { StatusProps } from "./statusbar.js";
import { HelpOverlay } from "./help.js";
import { helpLines, filterCommands } from "./commands.js";
import { ChatPage } from "./pages/chat.js";
import { FactoryPage, GEN_PRESETS, type FactoryFocus, type GenPreset, type ToolChip } from "./pages/factory.js";
import { McpPage, MCP_DIRECTORY, type McpFocus, type McpPanel } from "./pages/mcp.js";

/** Function-key escape sequences Ink's useInput swallows; parsed off raw stdin.
 *  Real terminals send these SS3/CSI codes with a leading ESC (e.g. F3 = ESC O R);
 *  strip it so both the raw and ESC-prefixed forms match. */
function fkey(data: string): Page | null {
  const d = data.startsWith("\x1b") ? data.slice(1) : data;
  if (d === "OP" || d === "[11~" || d === "[[A") return 1;
  if (d === "OQ" || d === "[12~" || d === "[[B") return 2;
  if (d === "OR" || d === "[13~" || d === "[[C") return 3;
  return null;
}

/** The whole UI: tabbed console (Chat · Skill Builder · MCP). */
export function Console(): React.ReactElement {
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
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [help, setHelp] = useState(false);
  const [slashSel, setSlashSel] = useState(0);
  const [pinnedModel, setPinnedModel] = useState<string | null>(null);
  const [modelPicker, setModelPicker] = useState(false);
  const [mpSel, setMpSel] = useState(0);

  // F2 Skill Builder form state.
  const [goal, setGoal] = useState("");
  const [factoryFocus, setFactoryFocus] = useState<FactoryFocus>("goal");
  const [factoryTools, setFactoryTools] = useState<Set<ToolId> | null>(null);
  const [toolIdx, setToolIdx] = useState(0);
  const [genIdx, setGenIdx] = useState(0);
  const [preset, setPreset] = useState<GenPreset>("auto");
  const [preview, setPreview] = useState("");

  // F3 MCP Manager state.
  const [sel3, setSel3] = useState(0);
  const [focus3, setFocus3] = useState<McpFocus>("list");
  const [mcpInput, setMcpInput] = useState("");
  const [panel, setPanel] = useState<McpPanel>({ kind: "empty" });

  const rcLoaded = useRef(false);
  const prefsRef = useRef<{ default_targets?: PerezRc["default_targets"]; default_provider?: PerezRc["default_provider"] }>({});

  const push = (kind: LogKind, text: string, cat?: LogCat) => setLog((l) => [...l, { kind, text, cat }].slice(-200));

  async function refresh(): Promise<HomeData> {
    const h = await loadHome();
    setHome(h);
    return h;
  }

  useEffect(() => {
    engineRef.current = new Engine();
    push("info", "Connecting to local Ollama API instance…");
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

  // Restore persisted preferences (~/.perezdevrc).
  useEffect(() => {
    void loadRc().then((rc) => {
      setPage(rc.last_active_tab);
      setAutonomy(rc.autonomy_mode);
      setIgnored(rc.mcp_ignored_servers);
      prefsRef.current = { default_targets: rc.default_targets, default_provider: rc.default_provider };
      rcLoaded.current = true;
    });
  }, []);

  // Persist preferences whenever they change (after the initial load). Best-effort.
  useEffect(() => {
    if (!rcLoaded.current) return;
    void saveRc({
      ...prefsRef.current,
      last_active_tab: page,
      autonomy_mode: autonomy,
      mcp_ignored_servers: ignored,
    }).catch(() => {});
  }, [page, autonomy, ignored]);

  // Seed the Skill Builder target chips from detected targets once home loads.
  useEffect(() => {
    if (home && factoryTools === null) setFactoryTools(new Set(home.targets));
  }, [home, factoryTools]);

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

  const baseProvider = status
    ? resolveProvider(status, mode === "plan" ? "thinking" : "normal", prefsRef.current.default_provider)
    : null;
  const provider: Provider | null =
    pinnedModel && status?.available && status.models.includes(pinnedModel)
      ? { kind: "local", model: pinnedModel, label: pinnedModel, status: "ollama up" }
      : baseProvider;
  const online = !!provider && provider.kind !== "none";
  const targets = home?.targets ?? [];
  const cloudLabel = baseProvider?.kind === "cloud" ? baseProvider.label : null;
  const routing = {
    normal: pinnedModel ?? status?.normal ?? cloudLabel ?? "—",
    planning: status?.thinking ?? status?.normal ?? cloudLabel ?? "—",
  };

  function goto(p: Page): void {
    setHelp(false);
    setModelPicker(false);
    setPage(p);
  }

  const typing =
    page === 1 || (page === 2 && factoryFocus === "goal") || (page === 3 && focus3 === "input");
  const slashOpen = page === 1 && input.trimStart().startsWith("/");

  useInput((ch, key) => {
    if (help) {
      if (key.escape || ch === "?") setHelp(false);
      return;
    }
    if (modelPicker) {
      const models = pickerModels();
      if (key.escape) return setModelPicker(false);
      if (models.length === 0) return;
      if (key.upArrow) return setMpSel((s) => (s + models.length - 1) % models.length);
      if (key.downArrow) return setMpSel((s) => (s + 1) % models.length);
      if (key.return) return choosePickerModel();
      return;
    }

    // Global toggles work on every page, even mid-task.
    if (key.tab && key.shift) return setMode((m) => (m === "normal" ? "plan" : "normal"));
    if (key.ctrl && ch === "a") return setAutonomy((a) => (a === "manual" ? "auto" : "manual"));
    if (key.ctrl && ch === "t") return setThinking((t) => (t === "low" ? "medium" : t === "medium" ? "high" : "low"));
    if (key.ctrl && ch === "m") return openModelPicker();

    if (key.escape) {
      if (confirm) return cancelConfirm();
      if (slashOpen) return setInput("");
      return goto(1);
    }

    // A pending confirm captures Y/N exclusively.
    if (confirm) {
      if (ch === "y" || ch === "Y") approveConfirm();
      else if (ch === "n" || ch === "N") cancelConfirm();
      return;
    }

    if (!typing && ch === "?") return setHelp(true);

    // ── Page 1 (chat) ──
    if (page === 1) {
      if (slashOpen) {
        const items = filterCommands(input);
        if (key.upArrow) return setSlashSel((s) => (s + items.length - 1) % items.length);
        if (key.downArrow) return setSlashSel((s) => (s + 1) % items.length);
        if (key.tab) {
          const pick = items[slashSel];
          if (pick) setInput(pick.name + " ");
          return;
        }
      }
      return; // chat TextInput owns all other keys
    }

    if (busy) return;

    // ── Page 2 (Skill Builder) ──
    if (page === 2) {
      if (factoryFocus !== "goal" && (ch === "1" || ch === "2" || ch === "3")) return goto(Number(ch) as Page);
      if (key.tab && !key.shift) {
        return setFactoryFocus((f) =>
          f === "goal" ? "tools" : f === "tools" ? "gen" : f === "gen" ? "generate" : "goal",
        );
      }
      if (factoryFocus === "tools") {
        const chips = toolChips();
        if (key.leftArrow) return setToolIdx((i) => (i + chips.length - 1) % Math.max(1, chips.length));
        if (key.rightArrow) return setToolIdx((i) => (i + 1) % Math.max(1, chips.length));
        if (ch === " ") return toggleTool(toolIdx);
      }
      if (factoryFocus === "gen") {
        if (key.leftArrow) return selectPreset((genIdx + GEN_PRESETS.length - 1) % GEN_PRESETS.length);
        if (key.rightArrow) return selectPreset((genIdx + 1) % GEN_PRESETS.length);
      }
      if (factoryFocus === "generate" && key.return) return void runFactoryBuild();
      return;
    }

    // ── Page 3 (MCP Manager) ──
    if (page === 3) {
      if (key.tab && !key.shift) {
        return setFocus3((f) => (f === "list" ? "button" : f === "button" ? "input" : "list"));
      }
      if (focus3 === "input") return; // custom-prompt field owns every other key
      if (ch === "1" || ch === "2") return goto(Number(ch) as Page);
      if (focus3 === "list") {
        if (key.upArrow) return setSel3((s) => (s + MCP_DIRECTORY.length - 1) % MCP_DIRECTORY.length);
        if (key.downArrow) return setSel3((s) => (s + 1) % MCP_DIRECTORY.length);
        if (key.return || ch === "i") return installDirectory(sel3);
        if (ch === "s") return void discoverMcp();
      }
      if (focus3 === "button" && (key.return || ch === "s")) return void discoverMcp();
      return;
    }
  });

  // ── model picker ──
  function pickerModels(): string[] {
    const local = status?.models ?? [];
    const cloud = cloudLabel ? [cloudLabel] : [];
    return [...local, ...cloud];
  }
  function openModelPicker(): void {
    const models = pickerModels();
    if (models.length === 0) return push("info", "no models available to pick — /pull a model or set a cloud key");
    const cur = pinnedModel ?? routing.normal;
    setMpSel(Math.max(0, models.indexOf(cur)));
    setModelPicker(true);
  }
  function choosePickerModel(): void {
    const models = pickerModels();
    const m = models[mpSel];
    setModelPicker(false);
    if (!m) return;
    if (m === cloudLabel) {
      setPinnedModel(null);
      push("ok", `model → ${m} (cloud)`);
    } else {
      setPinnedModel(m);
      push("ok", `model → ${m}`);
    }
  }

  // ── Skill Builder helpers ──
  function toolChips(): ToolChip[] {
    const set = factoryTools ?? new Set<ToolId>();
    return (home?.tools ?? []).map((t) => ({ id: t.id, label: t.name, on: set.has(t.id) }));
  }
  function toggleTool(i: number): void {
    const chips = toolChips();
    const chip = chips[i];
    if (!chip) return;
    setFactoryTools((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(chip.id)) next.delete(chip.id);
      else next.add(chip.id);
      return next;
    });
  }
  function selectPreset(i: number): void {
    setGenIdx(i);
    setPreset(GEN_PRESETS[i]!);
  }
  function selectedTargets(): ToolId[] {
    const set = [...(factoryTools ?? new Set<ToolId>())];
    return set.length ? set : targets;
  }
  async function runFactoryBuild(): Promise<void> {
    const desc = goal.trim();
    if (!desc) return push("err", "enter a goal first", "build");
    setPreview("");
    await buildAgent(desc, { targets: selectedTargets(), preview: true, cat: "build" });
  }

  /** Run a mutating action now (auto) or pop an inline Y/N confirm (manual). */
  async function guard(
    desc: string,
    run: () => Promise<string>,
    opts: { ignore?: string[]; diff?: string[] } = {},
  ): Promise<void> {
    if (autonomy === "auto") {
      await execute(run);
    } else {
      setConfirm({ desc, run, ignore: opts.ignore, diff: opts.diff });
      push("info", `⚠ confirm needed: ${desc}  (Y approve / N cancel)`);
    }
  }

  function approveConfirm(): void {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.resolve) return c.resolve(true);
    setLog((l) => l.filter((x) => !/^⚠ confirm needed|^discovered:/i.test(x.text)));
    if (c.run) void execute(c.run);
  }

  function cancelConfirm(): void {
    const c = confirm;
    if (!c) return;
    setConfirm(null);
    if (c.resolve) return c.resolve(false);
    if (c.ignore && c.ignore.length) {
      setIgnored((prev) => [...new Set([...prev, ...c.ignore!])]);
      push("info", `cancelled — won't suggest ${c.ignore.join(", ")} again`);
    } else {
      push("info", "cancelled");
    }
  }

  function confirmAsync(desc: string): Promise<boolean> {
    if (autonomy === "auto") return Promise.resolve(true);
    return new Promise((resolve) => setConfirm({ desc, resolve }));
  }

  function reportInstall(summary: string, paths: string[], cat?: LogCat): void {
    push("ok", summary, cat);
    const homeDir = process.env.HOME || "";
    const short = (p: string) => (homeDir && p.startsWith(homeDir) ? "~" + p.slice(homeDir.length) : p);
    paths.slice(0, 4).forEach((p) => push("info", `  → ${short(p)}`, cat));
    if (paths.length > 4) push("info", `  → (+${paths.length - 4} more)`, cat);
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

  async function callProvider(prompt: string, onToken?: (t: string) => void, system?: string): Promise<string> {
    const p: Provider | null = provider;
    if (!p || p.kind === "none") {
      throw new Error(providerHint(p ?? { kind: "none", label: "", status: "", reason: "offline" }));
    }
    if (p.kind === "local") return promptModel(engineRef.current!, p.model, prompt, { system, onToken });
    if (p.vendor === "anthropic") return promptAnthropic(p.model, prompt, { system, onToken });
    return promptOpenAI(p.model, prompt, { system, onToken });
  }

  /** Generate a skill body with the active LLM (when one is up), then confirm + write
   *  with a planned-file diff. Streams into `opts.sink` (chat partial or builder preview). */
  async function buildAgent(
    desc: string,
    opts: { targets?: ToolId[]; preview?: boolean; cat?: LogCat } = {},
  ): Promise<void> {
    const name = slugify(desc);
    const tgts = opts.targets ?? targets;
    const cat = opts.cat;
    // Stream tokens into the F2 preview pane when invoked from the builder,
    // otherwise into the chat partial line.
    const onToken = opts.preview
      ? (t: string) => setPreview((p) => p + t)
      : (t: string) => setPartial((p) => p + t);
    let body: string | undefined;
    if (provider && provider.kind !== "none") {
      setBusy(true);
      if (opts.preview) setPreview("");
      else setPartial("");
      push("info", "⠋ Querying active AI provider to generate custom skill instructions…", cat);
      try {
        body = (await callProvider(skillMetaprompt(desc), onToken)).trim() || undefined;
      } catch (e) {
        push("err", e instanceof Error ? e.message : String(e), cat);
      }
      setBusy(false);
    }
    if (!body) push("info", "no model connected — wrote a template skill. Start Ollama or set a key for AI-generated.", cat);
    let diff: string[] | undefined;
    try {
      diff = plannedToDiff(await planDescribed(name, desc, tgts, body));
    } catch {
      diff = undefined;
    }
    return guard(
      `build agent ${name} → ${tgts.join(", ")}`,
      async () => {
        const paths = await installDescribed(name, desc, tgts, body);
        await refresh();
        reportInstall(`built agent ${name} across ${tgts.length} tool(s) · ${body ? "AI-generated" : "template"}`, paths, cat);
        return "";
      },
      { diff },
    );
  }

  function installDirectory(i: number): void {
    const item = MCP_DIRECTORY[i];
    if (!item) return;
    const server = catalogMcp.find((m) => m.id === item.id);
    if (!server) return push("err", `no catalog entry for ${item.id}`, "mcp");
    void (async () => {
      let diff: string[] | undefined;
      try {
        diff = plannedToDiff(await planCatalogMcp(server, targets));
      } catch {
        diff = undefined;
      }
      void guard(
        `install mcp ${server.id} → ${targets.join(", ")}`,
        async () => {
          const paths = await installCatalogMcp(server, targets);
          await refresh();
          reportInstall(`installed mcp ${server.id} into ${paths.length} config(s)`, paths, "mcp");
          return "";
        },
        { diff },
      );
    })();
  }

  async function compileMcp(request: string): Promise<void> {
    const req = request.trim();
    setMcpInput("");
    if (!req) return;
    if (!provider || provider.kind === "none") {
      return push("err", providerHint(provider ?? { kind: "none", label: "", status: "", reason: "offline" }), "mcp");
    }
    setBusy(true);
    setPartial("");
    push("info", `⠋ Querying active AI provider to compile MCP config: ${req}`, "mcp");
    let parsed: { command: string; args: string[]; env: Record<string, string> };
    try {
      const raw = await callProvider(mcpMetaprompt(req), (t) => setPartial((p) => p + t));
      parsed = parseMcpConfig(raw);
    } catch (e) {
      setBusy(false);
      return push("err", e instanceof Error ? e.message : String(e), "mcp");
    }
    setBusy(false);
    const id = slugify(req);
    const json = JSON.stringify({ [id]: { command: parsed.command, args: parsed.args, env: parsed.env } }, null, 2);
    setPanel({ kind: "json", id, text: json });
    push("ok", `${id}: ${parsed.command} ${parsed.args.join(" ")}`, "mcp");
    return guard(
      `inject mcp ${id} → ${targets.join(", ")}`,
      async () => {
        const paths = await installCustomMcp(id, req, parsed, targets);
        await refresh();
        reportInstall(`injected mcp ${id} into ${paths.length} config(s)`, paths, "mcp");
        return "";
      },
    );
  }

  async function diagnose(file: string): Promise<void> {
    setBusy(true);
    try {
      const d = await engineDiagnose(file);
      push("err", `${d.kind}: ${d.message}`, "fix");
      push("ok", `→ ${d.hint}`, "fix");
      d.frames.forEach((f) => push("info", `  ${f.file}:${f.line}`, "fix"));
    } catch (e) {
      push("err", e instanceof Error ? e.message : String(e), "fix");
    }
    setBusy(false);
  }

  async function discoverMcp(): Promise<void> {
    const h = home ?? (await refresh());
    const recs = h.mcpSuggestions.filter((m) => !ignored.includes(m.server.id));
    setPanel({ kind: "scan", items: recs.map((m) => ({ id: m.server.id, reason: m.reason })) });
    if (recs.length === 0) return push("info", "no new MCP servers inferred for this workspace", "mcp");
    const servers = recs.map((m) => m.server);
    push("info", `discovered: ${servers.map((s) => s.id).join(", ")}`, "mcp");
    const sids = servers.map((s) => s.id);
    return guard(
      `inject ${servers.length} MCP server(s) → ${targets.join(", ")}`,
      async () => {
        const paths = new Set<string>();
        for (const s of servers) (await installCatalogMcp(s, targets)).forEach((p) => paths.add(p));
        await refresh();
        reportInstall(`injected ${sids.join(", ")} into ${paths.size} config(s)`, [...paths], "mcp");
        return "";
      },
      { ignore: sids },
    );
  }

  async function submit(raw: string): Promise<void> {
    const text = raw.trim();
    setInput("");
    setSlashSel(0);
    if (!text || busy) return;
    if (text.startsWith("/")) return slash(text);
    push("user", text, "chat");
    await runPrompt(text);
  }

  async function slash(text: string): Promise<void> {
    const [cmd, ...rest] = text.slice(1).split(/\s+/);
    const arg = rest.join(" ");
    if (cmd === "quit" || cmd === "exit") return exit();
    if (cmd === "clear") return setLog([]);
    if (cmd === "help") {
      helpLines().forEach((l) => push("info", l));
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
      h.mcp.forEach((m) => push("ok", `mcp   ${m.id}  (${m.targets.join(", ")})`, "mcp"));
      return;
    }
    if (cmd === "recommend") {
      setBusy(true);
      const h = await refresh();
      setBusy(false);
      if (h.proposals.length === 0 && h.mcpSuggestions.length === 0) return push("info", "you're fully set up");
      h.proposals.forEach((p) => push("info", `agent ${p.name} — ${p.reason}`));
      h.mcpSuggestions.forEach((m) => push("info", `mcp ${m.server.id} — ${m.reason}`, "mcp"));
      push("info", "install with /install <name>");
      return;
    }
    if (cmd === "install") {
      const h = home ?? (await refresh());
      const prop = h.proposals.find((p) => p.name === arg);
      const sug = h.mcpSuggestions.find((m) => m.server.id === arg) ?? catalogMcp.find((m) => m.id === arg);
      if (prop) {
        let diff: string[] | undefined;
        try {
          diff = plannedToDiff(await planDescribed(prop.name, prop.description, targets));
        } catch {
          diff = undefined;
        }
        return guard(
          `install agent ${prop.name} → ${targets.join(", ")}`,
          async () => {
            const paths = await installProposal(prop, targets);
            await refresh();
            reportInstall(`installed agent ${prop.name} across ${targets.length} tool(s)`, paths);
            return "";
          },
          { diff },
        );
      }
      if (sug) {
        const server = "server" in sug ? sug.server : sug;
        let diff: string[] | undefined;
        try {
          diff = plannedToDiff(await planCatalogMcp(server, targets));
        } catch {
          diff = undefined;
        }
        return guard(
          `install mcp ${server.id}`,
          async () => {
            const paths = await installCatalogMcp(server, targets);
            await refresh();
            reportInstall(`installed mcp ${server.id} into ${paths.length} config(s)`, paths, "mcp");
            return "";
          },
          { diff },
        );
      }
      return push("err", `unknown suggestion '${arg}' — run /recommend`);
    }
    if (cmd === "create") {
      const m = arg.match(/^(\S+)\s*:\s*(.+)$/);
      if (!m || !slugSchema.safeParse(m[1]).success) return push("err", "usage: /create <kebab-name>: <purpose>");
      const [, name, purpose] = m;
      let diff: string[] | undefined;
      try {
        diff = plannedToDiff(await planDescribed(name!, purpose!, targets));
      } catch {
        diff = undefined;
      }
      return guard(
        `create agent ${name} → ${targets.join(", ")}`,
        async () => {
          const paths = await installDescribed(name!, purpose!, targets);
          await refresh();
          reportInstall(`created agent ${name} across ${targets.length} tool(s)`, paths);
          return "";
        },
        { diff },
      );
    }
    if (cmd === "build") {
      if (!arg) return push("err", "usage: /build <describe the agent>");
      return buildAgent(arg, { cat: "build" });
    }
    if (cmd === "mcp") {
      const sub = rest[0] ?? "";
      if (sub === "auto" || sub === "discover") return discoverMcp();
      const server = catalogMcp.find((m) => m.id === sub);
      if (server) {
        let diff: string[] | undefined;
        try {
          diff = plannedToDiff(await planCatalogMcp(server, targets));
        } catch {
          diff = undefined;
        }
        return guard(
          `install mcp ${server.id}`,
          async () => {
            const paths = await installCatalogMcp(server, targets);
            await refresh();
            reportInstall(`installed mcp ${server.id} into ${paths.length} config(s)`, paths, "mcp");
            return "";
          },
          { diff },
        );
      }
      return push("err", "usage: /mcp auto  |  /mcp <id>", "mcp");
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
      push("info", `pulling ${arg}…`);
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
      push("info", `${d.kind}: ${d.message}`, "fix");
      push("info", `verify command: ${verify}`, "fix");
      const result = await runAutofix(
        { diagnosis: d, verifyCommand: verify },
        {
          callProvider: (p) => callProvider(p),
          exec: (c) => runCommand(c, { cwd: process.cwd() }),
          execInstall: (c) => runInstall(c, { cwd: process.cwd() }),
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
          log: (k, t) => push(k, t, "fix"),
        },
      );
      push(
        result.status === "fixed" ? "ok" : "err",
        `autofix ${result.status} — ${result.attempts} attempt(s), ${result.changedFiles.length} file(s) changed`,
        "fix",
      );
      await refresh();
    } catch (e) {
      push("err", e instanceof Error ? e.message : String(e), "fix");
    } finally {
      setBusy(false);
    }
  }

  async function runPrompt(text: string): Promise<void> {
    if (!provider || provider.kind === "none") {
      push("err", "chat unavailable — no model is connected", "chat");
      push("info", providerHint(provider ?? { kind: "none", label: "", status: "", reason: "offline" }), "chat");
      return;
    }
    const prompt = await resolveContext(text);
    const system = mode === "plan" ? THINKING_SYSTEM : undefined;
    setBusy(true);
    setPartial("");
    try {
      const full = await callProvider(prompt, (t) => setPartial((p) => p + t), system);
      push("ai", full.trim() || "(empty response)", "chat");
    } catch (err) {
      push("err", err instanceof Error ? err.message : String(err), "chat");
    } finally {
      setPartial("");
      setBusy(false);
    }
  }

  const staging = log.filter((l) => l.cat === "mcp");
  const footer: StatusProps = {
    model: provider?.label ?? "no-model",
    status: provider?.status ?? "…",
    mode,
    autonomy,
    thinking,
  };

  return (
    <Shell page={page} home={home} online={online} ollama={status?.available ?? false} routing={routing} footer={footer}>
      {help ? (
        <HelpOverlay />
      ) : modelPicker ? (
        <ModelPicker models={pickerModels()} sel={mpSel} active={pinnedModel ?? routing.normal} />
      ) : (
        <>
          {page === 1 && (
            <ChatPage
              log={log}
              busy={busy}
              partial={partial}
              mode={mode}
              online={online}
              input={input}
              setInput={(v) => {
                setInput(v);
                setSlashSel(0);
              }}
              submit={submit}
              inputActive={page === 1 && !confirm}
              slashOpen={slashOpen}
              slashSel={slashSel}
            />
          )}
          {page === 2 && (
            <FactoryPage
              goal={goal}
              setGoal={setGoal}
              onSubmitGoal={() => void runFactoryBuild()}
              tools={toolChips()}
              toolIdx={toolIdx}
              presetSel={preset}
              genIdx={genIdx}
              focus={confirm ? "generate" : factoryFocus}
              preview={preview}
              busy={busy}
              home={home}
            />
          )}
          {page === 3 && (
            <McpPage
              home={home}
              staging={staging}
              busy={busy}
              sel={sel3}
              focus={confirm ? "list" : focus3}
              panel={panel}
              mcpInput={mcpInput}
              setMcpInput={setMcpInput}
              onMcpSubmit={compileMcp}
            />
          )}
          {confirm && <ConfirmBox desc={confirm.desc} diff={confirm.diff} />}
        </>
      )}
    </Shell>
  );
}

/** Inline model picker overlay (Ctrl+M). */
function ModelPicker({ models, sel, active }: { models: string[]; sel: number; active: string }): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={theme.dim}>SELECT MODEL</Text>
      {models.length === 0 ? (
        <Text color={theme.muted}>no models — /pull one or set a cloud key</Text>
      ) : (
        models.map((m, i) => (
          <Box key={m}>
            <Box width={2} flexShrink={0}>
              <Text color={theme.accent}>{i === sel ? "›" : " "}</Text>
            </Box>
            <Text color={i === sel ? theme.accent : theme.fg2} bold={i === sel}>
              {m}
            </Text>
            {m === active && <Text color={theme.ok}>{"  ● active"}</Text>}
          </Box>
        ))
      )}
      <Box marginTop={1}>
        <Text color={theme.dim}>↑↓ move · enter select · esc cancel</Text>
      </Box>
    </Box>
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
