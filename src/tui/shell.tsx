import React from "react";
import { Box, Text } from "ink";
import Gradient from "ink-gradient";
import { theme } from "./theme.js";
import type { Autonomy, Thinking } from "./components.js";

export type Page = 1 | 2 | 3;

const TABS: { page: Page; key: string; label: string }[] = [
  { page: 1, key: "F1", label: "Chat Engine" },
  { page: 2, key: "F2", label: "Skill Builder" },
  { page: 3, key: "F3", label: "MCP Manager" },
];
const RULE = "─".repeat(74);

/** Outer chrome: matrix header, tab bar, page body, key hints, and the live footer. */
export function Shell({
  page,
  hint,
  footer,
  confirm,
  children,
  gradient,
}: {
  page: Page;
  hint?: string;
  footer: React.ReactNode;
  confirm?: React.ReactNode;
  children: React.ReactNode;
  gradient: string;
}): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={2} paddingY={1} width={80}>
      <Text>
        <Gradient name={gradient as never}>
          <Text bold>PerezDev Hub</Text>
        </Gradient>
        <Text dimColor>{" v2.0"}</Text>
      </Text>

      <Box marginTop={1}>
        {TABS.map((t, i) => {
          const on = page === t.page;
          return (
            <Text key={t.page}>
              {i > 0 ? <Text dimColor>{"  "}</Text> : null}
              {on ? (
                <Text backgroundColor={theme.accent} color="black" bold>{` ${t.key} ${t.label} `}</Text>
              ) : (
                <Text dimColor>{` ${t.key} ${t.label} `}</Text>
              )}
            </Text>
          );
        })}
      </Box>
      <Text dimColor>{RULE}</Text>

      <Box flexDirection="column" marginY={1}>
        {children}
        {confirm}
      </Box>

      <Text dimColor>{RULE}</Text>
      {hint ? (
        <Box marginTop={1}>
          <Text color={theme.muted}>{"  keys  "}</Text>
          <Text dimColor>{hint}</Text>
        </Box>
      ) : null}
      <Box marginTop={1}>{footer}</Box>
    </Box>
  );
}

/** Footer metadata bar shared across pages. */
export function Footer({
  label,
  status,
  autonomy,
  thinking,
}: {
  label: string;
  status: string;
  autonomy: Autonomy;
  thinking: Thinking;
}): React.ReactElement {
  return (
    <Text>
      <Text color={theme.accent}>{`◆ ${label}`}</Text>
      <Text dimColor>{`   autonomy ${autonomy}   ·   thinking ${thinking}   ·   ${status}`}</Text>
    </Text>
  );
}
