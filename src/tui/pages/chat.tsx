import React from "react";
import { Box, Text, useStdout } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { theme } from "../theme.js";
import { Row, type Autonomy, type LogLine, type Mode } from "../components.js";
import { SlashMenu } from "../slash.js";
import { OFFLINE_HINT, PROMPT_PLACEHOLDER } from "../copy.js";
import { EmptyChat } from "../empty-chat.js";

/** Page 1 — conversation + prompt. Chrome (model, tabs) lives in the shell. */
export function ChatPage({
  log,
  busy,
  partial,
  mode,
  online,
  autonomy,
  agentLabel,
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
  autonomy: Autonomy;
  agentLabel: string;
  input: string;
  setInput: (s: string) => void;
  submit: (s: string) => void;
  inputActive: boolean;
  slashOpen: boolean;
  slashSel: number;
}): React.ReactElement {
  const { stdout } = useStdout();
  const rows = Math.max(6, Math.min((stdout?.rows ?? 40) - 16, 24));
  const recent = log.slice(-rows);
  const focused = inputActive || slashOpen;
  const empty = log.length === 0 && !busy;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" flexGrow={1} marginTop={1}>
        {empty && <EmptyChat />}
        {recent.map((l, i) => (
          <Row key={i} line={l} agentLabel={agentLabel} />
        ))}
        {busy && (
          <Box flexDirection="column" marginTop={1}>
            <Text color={theme.accent} bold>
              {agentLabel}
            </Text>
            <Box>
              <Text color={theme.accent}>
                <Spinner type="dots" />
              </Text>
              <Text color={theme.fg2}>{" " + (partial.slice(-240) || "working…")}</Text>
            </Box>
          </Box>
        )}
      </Box>

      {!online && (
        <Box borderStyle="round" borderColor={theme.warn} paddingX={1} marginX={2} marginTop={1}>
          <Text color={theme.warn} wrap="wrap">
            {OFFLINE_HINT}
          </Text>
        </Box>
      )}

      {slashOpen && <SlashMenu query={input} sel={slashSel} />}

      <Box marginTop={1} borderStyle="round" borderColor={focused ? theme.accent : theme.line} paddingX={1}>
        <Text color={mode === "plan" ? theme.violet : theme.accent}>{mode === "plan" ? "plan › " : "› "}</Text>
        <Box flexGrow={1}>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={submit}
            focus={inputActive}
            placeholder={PROMPT_PLACEHOLDER}
          />
        </Box>
        <Text color={autonomy === "auto" ? theme.ok : theme.muted} bold={autonomy === "auto"}>
          {autonomy === "auto" ? " AUTO" : " manual"}
        </Text>
      </Box>
    </Box>
  );
}
