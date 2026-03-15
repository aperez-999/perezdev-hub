import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import Gradient from "ink-gradient";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { theme } from "./theme.js";
import { Engine } from "../engine/bridge.js";
import { detectOllama, promptModel, THINKING_SYSTEM, type OllamaStatus } from "../core/ollama.js";
import { readIfExists } from "../util/fs-safe.js";

type Mode = "normal" | "plan";
type Autonomy = "manual" | "auto";
type Thinking = "low" | "medium" | "high";

interface LogLine {
  kind: "info" | "ok" | "err" | "user" | "ai";
  text: string;
}

const RULE = "─".repeat(72);
const DRULE = "═".repeat(28);

/** OpenDev-style local-AI console: prompt local models, stream into the log. */
export function ChatView({ gradient, onBack }: { gradient: string; onBack: () => void }): React.ReactElement {
  const engineRef = useRef<Engine | null>(null);
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [input, setInput] = useState("");
  const [partial, setPartial] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("normal");
  const [autonomy, setAutonomy] = useState<Autonomy>("manual");
  const [thinking, setThinking] = useState<Thinking>("medium");

  const push = (line: LogLine) => setLog((l) => [...l, line].slice(-12));

  useEffect(() => {
    engineRef.current = new Engine();
    push({ kind: "info", text: "Connecting to local Ollama API instance..." });
    detectOllama(engineRef.current).then((s) => {
      setStatus(s);
      if (s.available) {
        push({ kind: "ok", text: `Verified models: ${s.normal ?? "?"} (normal), ${s.thinking ?? "?"} (thinking)` });
      } else {
        push({ kind: "err", text: s.error || "Ollama not reachable" });
        push({ kind: "info", text: "Install + run Ollama, then `ollama pull qwen2.5-coder`." });
      }
    });
    return () => engineRef.current?.close();
  }, []);

  const model = mode === "plan" ? status?.thinking : status?.normal;

  useInput((inputChar, key) => {
    if (busy) return;
    if (key.escape) {
      onBack();
    } else if (key.tab && key.shift) {
      setMode((m) => (m === "normal" ? "plan" : "normal"));
    } else if (key.ctrl && inputChar === "a") {
      setAutonomy((a) => (a === "manual" ? "auto" : "manual"));
    } else if (key.ctrl && inputChar === "t") {
      setThinking((t) => (t === "low" ? "medium" : t === "medium" ? "high" : "low"));
    }
  });

  async function submit(raw: string): Promise<void> {
    const text = raw.trim();
    setInput("");
    if (!text) return;
    if (text === "/quit" || text === "/exit") return onBack();
    if (text === "/help") {
      push({ kind: "info", text: "/models · Shift+Tab plan/normal · Ctrl+A autonomy · Ctrl+T thinking · @file context · esc back" });
      return;
    }
    if (text === "/models") {
      push({ kind: "info", text: status?.models.length ? status.models.join(", ") : "no local models pulled" });
      return;
    }
    if (!model) {
      push({ kind: "err", text: "No local model available. Start Ollama and pull one (e.g. qwen2.5-coder)." });
      return;
    }

    push({ kind: "user", text });
    const prompt = await resolveContext(text);
    const system = mode === "plan" ? THINKING_SYSTEM : undefined;

    setBusy(true);
    setPartial("");
    try {
      const full = await promptModel(engineRef.current!, model, prompt, {
        system,
        onToken: (t) => setPartial((p) => p + t),
      });
      push({ kind: "ai", text: full.trim() || "(empty response)" });
    } catch (err) {
      push({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setPartial("");
      setBusy(false);
    }
  }

  return (
    <Box flexDirection="column">
      <Gradient name={gradient as never}>
        <Text>{"   .  :  .:::..  .:::\n  . ... :::: ..:::::\n  P E R E Z D E V   H U B\n  : . :::::...  ::."}</Text>
      </Gradient>
      <Text color={theme.accent}>{` ${DRULE} PerezDev Hub v2.0 ${DRULE}`}</Text>
      <Text dimColor> /help · /models · Shift+Tab plan · @file context</Text>
      <Text dimColor>{RULE}</Text>

      <Box flexDirection="column" marginTop={1}>
        <Text bold color={theme.accent}>[AUTOMATION STREAM]</Text>
        {log.map((l, i) => (
          <LogRow key={i} line={l} />
        ))}
        {busy && (
          <Text>
            <Text color={theme.accent}>
              <Spinner type="dots" />
            </Text>{" "}
            <Text dimColor>{partial.slice(-280) || "thinking..."}</Text>
          </Text>
        )}
      </Box>

      <Text dimColor>{RULE}</Text>
      <Text>
        <Text color={mode === "plan" ? theme.warn : theme.ok}>{mode === "plan" ? " Planning Mode " : " Normal Mode "}</Text>
        <Text dimColor>(Shift+Tab)</Text>
      </Text>
      <Box>
        <Text color={theme.accentBright}>{"› "}</Text>
        <TextInput value={input} onChange={setInput} onSubmit={submit} placeholder="type an automation prompt, /help, or @file..." />
      </Box>

      <Text dimColor>{RULE}</Text>
      <Text>
        <Text color={theme.accent}>◆ {model ?? "no-model"}</Text>
        <Text dimColor>{`  │  Autonomy: ${autonomy}  │  Thinking: ${thinking}  │  ${status?.available ? "ollama up" : "ollama down"}`}</Text>
      </Text>
    </Box>
  );
}

function LogRow({ line }: { line: LogLine }): React.ReactElement {
  if (line.kind === "user") return <Text color={theme.accentBright}>{`› ${line.text}`}</Text>;
  if (line.kind === "ai") return <Text>{`  ${line.text}`}</Text>;
  const icon = line.kind === "ok" ? <Text color={theme.ok}>✔ </Text> : line.kind === "err" ? <Text color={theme.bad}>✘ </Text> : <Text color={theme.accent}>● </Text>;
  return (
    <Text>
      {icon}
      <Text dimColor>{line.text}</Text>
    </Text>
  );
}

/** Replace @file tokens with the file's contents injected as context. */
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
