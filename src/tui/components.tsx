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

/** A pending mutating action awaiting manual Y/N approval. */
export interface PendingConfirm {
  desc: string;
  run: () => Promise<string>;
  /** MCP server ids to remember as "declined" if the user cancels this prompt. */
  ignore?: string[];
}

/** Inline manual-confirmation dialog rendered on any page (no chat bar needed). */
export function ConfirmBox({ desc }: { desc: string }): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.warn} paddingX={1} marginTop={1}>
      <Text color={theme.warn} bold>⚠ MANUAL CONFIRMATION REQUIRED</Text>
      <Text>{desc}?</Text>
      <Text>
        <Text color={theme.ok} bold>[Y] Approve</Text>
        <Text dimColor>{"  │  "}</Text>
        <Text color={theme.bad} bold>[N] Cancel</Text>
      </Text>
    </Box>
  );
}

/** IDE / CLI / Ollama detection badges plus the project signal line.
 *  Reflects the real machine footprint from the live ecosystem scan. */
export function Badges({ home, ollama }: { home: HomeData | null; ollama: boolean }): React.ReactElement {
  const eco = home?.ecosystem ?? [];
  const ide = eco.filter((t) => t.kind === "ide");
  const cli = eco.filter((t) => t.kind === "cli");
  const dot = (on: boolean) => (on ? theme.ok : theme.muted);
  const badge = (id: string, on: boolean) => (
    <Text key={id} color={dot(on)}>{`${on ? "●" : "○"} ${id}  `}</Text>
  );
  return (
    <Box flexDirection="column">
      <Text>
        <Text dimColor>[IDEs] </Text>
        {ide.map((t) => badge(t.label, t.present))}
      </Text>
      <Text>
        <Text dimColor>[CLIs] </Text>
        {cli.map((t) => badge(t.label, t.present))}
        <Text color={dot(ollama)}>{`${ollama ? "●" : "○"} ollama (local)`}</Text>
      </Text>
      <Text dimColor>{`project: ${home?.scan.signals.join(" · ") || "—"}`}</Text>
    </Box>
  );
}
