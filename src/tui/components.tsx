import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";
import type { HomeData } from "./data.js";

export type Mode = "normal" | "plan";
export type Autonomy = "manual" | "auto";
export type Thinking = "low" | "medium" | "high";
export type LogKind = "info" | "ok" | "err" | "user" | "ai";
export interface LogLine {
  kind: LogKind;
  text: string;
}

export const CLI_IDS = new Set(["claude-code", "codex"]);

/** One styled log line in the automation stream. */
export function Row({ line }: { line: LogLine }): React.ReactElement {
  if (line.kind === "user") return <Text color={theme.accentBright}>{`› ${line.text}`}</Text>;
  if (line.kind === "ai") return <Text>{`  ${line.text}`}</Text>;
  const icon =
    line.kind === "ok" ? (
      <Text color={theme.ok}>✔ </Text>
    ) : line.kind === "err" ? (
      <Text color={theme.bad}>✘ </Text>
    ) : (
      <Text color={theme.accent}>● </Text>
    );
  return (
    <Text>
      {icon}
      <Text dimColor>{line.text}</Text>
    </Text>
  );
}

/** IDE / CLI / Ollama detection badges plus the project signal line. */
export function Badges({ home, ollama }: { home: HomeData | null; ollama: boolean }): React.ReactElement {
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
