import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { theme } from "../theme.js";
import { Badges, Row, SectionHeader, type LogLine, type Mode } from "../components.js";
import type { HomeData } from "../data.js";
import type { OllamaStatus } from "../../core/ollama.js";

/** Page 1 — the chat engine: ecosystem map, log stream, and the input capsule. */
export function ChatPage({
  home,
  status,
  log,
  busy,
  partial,
  mode,
  input,
  setInput,
  submit,
  inputActive,
}: {
  home: HomeData | null;
  status: OllamaStatus | null;
  log: LogLine[];
  busy: boolean;
  partial: string;
  mode: Mode;
  input: string;
  setInput: (s: string) => void;
  submit: (s: string) => void;
  inputActive: boolean;
}): React.ReactElement {
  const recent = log.slice(-12);
  return (
    <Box flexDirection="column">
      <Badges home={home} ollama={status?.available ?? false} />

      <Box flexDirection="column" marginTop={1} height={14}>
        <SectionHeader label="activity" />
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

      <Box marginTop={1}>
        <Text color={mode === "plan" ? theme.warn : theme.muted}>
          {`${mode === "plan" ? "Planning" : "Normal"} mode `}
          {"─".repeat(60)}
        </Text>
      </Box>
      <Box borderStyle="round" borderColor={inputActive ? theme.accent : theme.muted} paddingX={1}>
        <Text color={theme.accentBright}>{"› "}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={submit}
          focus={inputActive}
          placeholder="type a prompt or /command..."
        />
      </Box>
    </Box>
  );
}
