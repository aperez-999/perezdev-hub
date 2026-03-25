import React from "react";
import { Box, Text, useStdout } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { theme } from "../theme.js";
import { Row, SectionHeader, type LogLine, type Mode } from "../components.js";
import { SlashMenu } from "../slash.js";

/** Page 1 — the chat engine: category log, offline banner, slash menu, capsule.
 *  Detection badges now live in the persistent rail (see rail.tsx). */
export function ChatPage({
  log,
  busy,
  partial,
  mode,
  online,
  input,
  setInput,
  submit,
  inputActive,
  slashOpen,
  slashSel,
}: {
  log: LogLine[];
  busy: boolean;
  partial: string;
  mode: Mode;
  online: boolean;
  input: string;
  setInput: (s: string) => void;
  submit: (s: string) => void;
  inputActive: boolean;
  slashOpen: boolean;
  slashSel: number;
}): React.ReactElement {
  const { stdout } = useStdout();
  // Derive the visible log height from the terminal instead of a magic number.
  const rows = Math.max(6, Math.min((stdout?.rows ?? 40) - 16, 24));
  const recent = log.slice(-rows);
  const focused = inputActive || slashOpen;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <SectionHeader label="chat engine" />

      <Box flexDirection="column" flexGrow={1} marginTop={1}>
        {recent.map((l, i) => (
          <Row key={i} line={l} />
        ))}
        {busy && (
          <Box>
            <Text color={theme.accent}>
              <Spinner type="dots" />
            </Text>
            <Text color={theme.fg2}>{" " + (partial.slice(-240) || "working…")}</Text>
          </Box>
        )}
      </Box>

      {!online && (
        <Box borderStyle="round" borderColor={theme.warn} paddingX={1} marginX={2} marginTop={1}>
          <Text color={theme.warn}>⚠ No model. Run </Text>
          <Text color={theme.warn} bold>
            ollama pull qwen2.5-coder
          </Text>
          <Text color={theme.warn}> or set ANTHROPIC_API_KEY.</Text>
        </Box>
      )}

      {slashOpen && <SlashMenu query={input} sel={slashSel} />}

      <Box marginTop={1} borderStyle="round" borderColor={focused ? theme.accent : theme.line} paddingX={1}>
        <Text color={mode === "plan" ? theme.violet : theme.accent}>{mode === "plan" ? "plan › " : "› "}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={submit}
          focus={inputActive}
          placeholder="type a prompt or /command…"
        />
      </Box>
    </Box>
  );
}
