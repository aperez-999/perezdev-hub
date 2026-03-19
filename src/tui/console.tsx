import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Gradient from "ink-gradient";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { theme } from "./theme.js";
import { Engine } from "../engine/bridge.js";
import { detectOllama, promptModel, THINKING_SYSTEM, type OllamaStatus } from "../core/ollama.js";
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

type Mode = "normal" | "plan";
type Autonomy = "manual" | "auto";
type Thinking = "low" | "medium" | "high";
type LogKind = "info" | "ok" | "err" | "user" | "ai";
interface LogLine {
  kind: LogKind;
  text: string;
}

const DRULE = "═".repeat(24);
const HEADER = ["  .  :  .:::..  .:::", " . ... :::: ..:::::", " P E R E Z D E V   H U B", " : . :::::...  ::.", "  ..  ..  ...   ."];
const CLI_IDS = new Set(["claude-code", "codex"]);

/** The whole UI: a bordered OpenDev-style console with a command loop. */
export function Console({ gradient }: { gradient: string }): React.ReactElement {
  const { exit } = useApp();
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
      if (s.available) push("ok", `Detected models: ${s.normal ?? "?"} (Normal), ${s.thinking ?? "?"} (Think)`);
      else push("err", s.error || "Ollama not reachable");
      push("info", "Type a prompt, or /help for commands.");
    });
    return () => engineRef.current?.close();
  }, []);

  const model = mode === "plan" ? status?.thinking : status?.normal;
  const targets = home?.targets ?? [];

  useInput((ch, key) => {
    if (busy) return;
    if (key.tab && key.shift) setMode((m) => (m === "normal" ? "plan" : "normal"));
    else if (key.ctrl && ch === "a") setAutonomy((a) => (a === "manual" ? "auto" : "manual"));
    else if (key.ctrl && ch === "t") setThinking((t) => (t === "low" ? "medium" : t === "medium" ? "high" : "low"));
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
        "  <prompt>            ask the local model (Shift+Tab = planning)",
        "  @file <prompt>      inject a file's contents as context",
        "  /models /list       local models · installed agents",
        "  /recommend          generate suggestions for this project",
        "  /install <name>     install a suggestion (agent or mcp)",
        "  /create <name>: <purpose>",
        "  /map [dir]  /fix <file>",
        "  /yes                apply a pending manual action",
        "  Ctrl+A autonomy · Ctrl+T thinking · /quit",
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
    if (cmd === "map") {
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
    if (cmd === "fix") {
      if (!arg) return push("err", "usage: /fix <logfile>");
      setBusy(true);
      try {
        const d = await engineDiagnose(arg);
        push("err", `${d.kind}: ${d.message}`);
        push("ok", `→ ${d.hint}`);
        d.frames.forEach((f) => push("info", `  ${f.file}:${f.line}`));
      } catch (e) {
        push("err", e instanceof Error ? e.message : String(e));
      }
      setBusy(false);
      return;
    }
    push("err", `unknown command: /${cmd}  (try /help)`);
  }

  async function runPrompt(text: string): Promise<void> {
    if (!model) return push("err", "no local model — start Ollama and pull one (e.g. qwen2.5-coder)");
    const prompt = await resolveContext(text);
    setBusy(true);
    setPartial("");
    try {
      const full = await promptModel(engineRef.current!, model, prompt, {
        system: mode === "plan" ? THINKING_SYSTEM : undefined,
        onToken: (t) => setPartial((p) => p + t),
      });
      push("ai", full.trim() || "(empty response)");
    } catch (err) {
      push("err", err instanceof Error ? err.message : String(err));
    } finally {
      setPartial("");
      setBusy(false);
    }
  }

  const recent = log.slice(-13);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={1} width={78}>
      <Gradient name={gradient as never}>
        <Text>{HEADER.join("\n")}</Text>
      </Gradient>
      <Text color={theme.accent}>{`${DRULE} PerezDev Hub v2.0 ${DRULE}`}</Text>
      <Text dimColor>/help · /models · Shift+Tab plan mode · @file context</Text>
      <Text dimColor>{"─".repeat(74)}</Text>

      <Badges home={home} ollama={status?.available ?? false} />

      <Box flexDirection="column" marginTop={1}>
        <Text bold color={theme.accent}>[AUTOMATION &amp; LOG STREAM]</Text>
        {recent.map((l, i) => (
          <Row key={i} line={l} />
        ))}
        {busy && (
          <Text>
            <Text color={theme.accent}>
              <Spinner type="dots" />
            </Text>{" "}
            <Text dimColor>{partial.slice(-200) || "working..."}</Text>
          </Text>
        )}
      </Box>

      <Text color={mode === "plan" ? theme.warn : theme.muted}>
        {`─── ${mode === "plan" ? "Planning" : "Normal"} Mode (Shift+Tab) `}{"─".repeat(40)}
      </Text>
      <Box>
        <Text color={theme.accentBright}>{"› "}</Text>
        <TextInput value={input} onChange={setInput} onSubmit={submit} placeholder="type a prompt or /command..." />
      </Box>
      <Text dimColor>{"─".repeat(74)}</Text>
      <Text>
        <Text color={theme.accent}>◆ {model ?? "no-model"}</Text>
        <Text dimColor>{`  │  Autonomy: ${autonomy}  │  Thinking: ${thinking}  │  ${status?.available ? "ollama up" : "ollama down"}`}</Text>
      </Text>
    </Box>
  );
}

function Badges({ home, ollama }: { home: HomeData | null; ollama: boolean }): React.ReactElement {
  const tools = home?.tools ?? [];
  const ide = tools.filter((t) => !CLI_IDS.has(t.id));
  const cli = tools.filter((t) => CLI_IDS.has(t.id));
  const dot = (on: boolean) => (on ? theme.ok : theme.muted);
  return (
    <Box flexDirection="column">
      <Text>
        <Text dimColor>[IDEs] </Text>
        {ide.map((t) => (
          <Text key={t.id} color={dot(t.installed)}>{`${t.installed ? "●" : "○"} ${t.id}  `}</Text>
        ))}
      </Text>
      <Text>
        <Text dimColor>[CLIs] </Text>
        {cli.map((t) => (
          <Text key={t.id} color={dot(t.installed)}>{`${t.installed ? "●" : "○"} ${t.id}  `}</Text>
        ))}
        <Text color={dot(ollama)}>{`${ollama ? "●" : "○"} ollama (local)`}</Text>
      </Text>
      <Text dimColor>{`project: ${home?.scan.signals.join(" · ") || "—"}`}</Text>
    </Box>
  );
}

function Row({ line }: { line: LogLine }): React.ReactElement {
  if (line.kind === "user") return <Text color={theme.accentBright}>{`› ${line.text}`}</Text>;
  if (line.kind === "ai") return <Text>{`  ${line.text}`}</Text>;
  const icon =
    line.kind === "ok" ? <Text color={theme.ok}>✔ </Text> : line.kind === "err" ? <Text color={theme.bad}>✘ </Text> : <Text color={theme.accent}>● </Text>;
  return (
    <Text>
      {icon}
      <Text dimColor>{line.text}</Text>
    </Text>
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
