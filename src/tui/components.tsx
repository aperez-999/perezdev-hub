import React from "react";
import { Box, Text } from "ink";
import Gradient from "ink-gradient";
import Spinner from "ink-spinner";
import { theme } from "./theme.js";
import type { ToolBadge } from "./data.js";

/** Shimmering gradient wordmark — `name` is cycled by the parent for animation. */
export function Logo({ gradient }: { gradient: string }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Gradient name={gradient as never}>
        <Text bold>{"◆  P E R E Z D E V   H U B"}</Text>
      </Gradient>
      <Text dimColor>your AI dev workflow, generated for this project</Text>
    </Box>
  );
}

const CLI_TOOLS = new Set(["claude-code", "codex"]);

function badgeGroup(label: string, tools: ToolBadge[]): React.ReactElement {
  return (
    <Text>
      <Text dimColor>{label.padEnd(7)}</Text>
      {tools.map((t) => (
        <Text key={t.id} color={t.installed ? theme.ok : theme.muted}>
          {t.installed ? "● " : "○ "}
          {t.id}
          {"   "}
        </Text>
      ))}
    </Text>
  );
}

/** Tool detection badges, grouped into CLIs and IDEs. */
export function ToolBadges({ tools }: { tools: ToolBadge[] }): React.ReactElement {
  return (
    <Box flexDirection="column">
      {badgeGroup("[CLIs]", tools.filter((t) => CLI_TOOLS.has(t.id)))}
      {badgeGroup("[IDEs]", tools.filter((t) => !CLI_TOOLS.has(t.id)))}
    </Box>
  );
}

/** Inline braille spinner with a label. */
export function Loading({ label }: { label: string }): React.ReactElement {
  return (
    <Text>
      <Text color={theme.accent}>
        <Spinner type="dots" />
      </Text>
      {"  "}
      {label}
    </Text>
  );
}

export function Footer({ keys }: { keys: string }): React.ReactElement {
  return (
    <Box marginTop={1}>
      <Text dimColor>{keys}</Text>
    </Box>
  );
}

/** A single selectable row with an animated cursor. */
export function Row({
  active,
  checked,
  label,
  hint,
}: {
  active: boolean;
  checked?: boolean;
  label: string;
  hint?: string;
}): React.ReactElement {
  const cursor = active ? <Text color={theme.accentBright}>{"▸ "}</Text> : <Text>{"  "}</Text>;
  const box = checked === undefined ? "" : checked ? "◉ " : "○ ";
  return (
    <Box>
      <Text>{cursor}</Text>
      {box ? <Text color={checked ? theme.ok : theme.muted}>{box}</Text> : null}
      <Text color={active ? theme.accentBright : undefined} bold={active}>
        {label}
      </Text>
      {hint ? <Text dimColor>{`   ${hint}`}</Text> : null}
    </Box>
  );
}
