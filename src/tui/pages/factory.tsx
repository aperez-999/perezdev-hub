import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { theme } from "../theme.js";

export interface FactoryItem {
  label: string;
  hint: string;
}

export const FACTORY_ITEMS: FactoryItem[] = [
  { label: "Create Custom Agent Skill", hint: "Generates rules across active IDEs" },
  { label: "Run Workspace Diagnoser", hint: "Scans terminal trace log histories" },
  { label: "View Project Skills", hint: "Lists active .md / .mdc rule files" },
];

export interface Overlay {
  prompt: string;
  value: string;
}

/** Page 2 — arrow-navigable agent factory; chat loop hidden. */
export function FactoryPage({
  sel,
  overlay,
  setOverlayValue,
  onOverlaySubmit,
  skills,
  status,
  busy,
}: {
  sel: number;
  overlay: Overlay | null;
  setOverlayValue: (s: string) => void;
  onOverlaySubmit: (s: string) => void;
  skills: string[] | null;
  status: string | null;
  busy: boolean;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>SELECT AN ACTION FROM THE AGENT TOOLKIT:</Text>
      <Box flexDirection="column" marginTop={1}>
        {FACTORY_ITEMS.map((it, i) => {
          const on = i === sel;
          return (
            <Text key={it.label} color={on ? theme.accentBright : undefined} bold={on}>
              {`${on ? "► " : "  "}${it.label}`}
              <Text dimColor>{`   [${it.hint}]`}</Text>
            </Text>
          );
        })}
      </Box>

      {overlay && (
        <Box marginTop={1} borderStyle="round" borderColor={theme.accent} paddingX={1}>
          <Text color={theme.accentBright}>{`${overlay.prompt} `}</Text>
          <TextInput value={overlay.value} onChange={setOverlayValue} onSubmit={onOverlaySubmit} focus />
        </Box>
      )}

      {skills && !overlay && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={theme.accent}>PROJECT SKILLS:</Text>
          {skills.length === 0 ? (
            <Text dimColor>  none installed yet — use Create Custom Agent</Text>
          ) : (
            skills.map((s, i) => (
              <Text key={i} color={theme.ok}>{`  • ${s}`}</Text>
            ))
          )}
        </Box>
      )}

      {(busy || status) && !overlay && (
        <Box marginTop={1}>
          {busy && <Text color={theme.accent}>working… </Text>}
          {status && <Text color={theme.ok}>{`✓ ${status}`}</Text>}
        </Box>
      )}
    </Box>
  );
}
