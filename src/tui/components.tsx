import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";
import { CONFIRM_TITLE } from "./copy.js";

export type Mode = "normal" | "plan";
export type Autonomy = "manual" | "auto";
export type Thinking = "low" | "medium" | "high";
export type LogKind = "info" | "ok" | "err" | "user" | "ai";
export type LogCat = "chat" | "mcp" | "build" | "fix";
export interface LogLine {
  kind: LogKind;
  text: string;
  /** Category for filtered views (e.g. F3 staging shows only cat:"mcp"). */
  cat?: LogCat;
}

const GLYPH: Record<"ok" | "err" | "info", [string, string]> = {
  ok: ["✔", theme.ok],
  err: ["✘", theme.bad],
  info: ["●", theme.accent],
};

export function Row({ line, agentLabel }: { line: LogLine; agentLabel?: string }): React.ReactElement {
  if (line.kind === "user") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.violet} bold>
          you
        </Text>
        <Text color={theme.fg} wrap="wrap">
          {line.text}
        </Text>
      </Box>
    );
  }
  if (line.kind === "ai") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.accent} bold>
          {agentLabel || "model"}
        </Text>
        <Text color={theme.fg} wrap="wrap">
          {line.text}
        </Text>
      </Box>
    );
  }
  const [glyph, color] = GLYPH[line.kind];
  return (
    <Box>
      <Box width={2} flexShrink={0}>
        <Text color={color}>{glyph}</Text>
      </Box>
      <Text color={theme.fg2} wrap="wrap">
        {line.text}
      </Text>
    </Box>
  );
}

/** A pending mutating action awaiting manual Y/N approval. */
export interface PendingConfirm {
  desc: string;
  /** Fire-and-forget action run on approve (returns a log line). */
  run?: () => Promise<string>;
  /** Promise-style gate: resolve(true) on approve, resolve(false) on cancel. */
  resolve?: (ok: boolean) => void;
  /** MCP server ids to remember as "declined" if the user cancels this prompt. */
  ignore?: string[];
  /** Planned-file diff lines (+ add / ~ change / - remove) shown before write. */
  diff?: string[];
}

/** Inline manual-confirmation dialog with an optional planned-file diff. */
export function ConfirmBox({ desc, diff }: { desc: string; diff?: string[] }): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.warn} paddingX={1} marginTop={1}>
      <Text color={theme.warn} bold>
        {CONFIRM_TITLE}
      </Text>
      <Text color={theme.fg}>{desc}</Text>
      {diff && diff.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {diff.map((d, i) => {
            const c = d[0] === "+" ? theme.ok : d[0] === "-" ? theme.bad : d[0] === "~" ? theme.warn : theme.fg2;
            return (
              <Text key={i} color={c}>
                {d}
              </Text>
            );
          })}
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={theme.ok} bold>
          [Y] Approve
        </Text>
        <Text dimColor>{"  │  "}</Text>
        <Text color={theme.bad} bold>
          [N] Cancel
        </Text>
      </Box>
    </Box>
  );
}
