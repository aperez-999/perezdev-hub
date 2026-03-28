import React from "react";
import { Box, Text } from "ink";
import Gradient from "ink-gradient";
import { theme } from "./theme.js";
import type { Autonomy, Thinking } from "./components.js";

export type Page = 1 | 2 | 3;

const HEADER = [
  "  .  :  .:::..  .:::",
  " . ... :::: ..:::::",
  " P E R E Z D E V   H U B",
  " : . :::::...  ::.",
  "  ..  ..  ...   .",
];
const DRULE = "═".repeat(70);

const TABS: { page: Page; label: string }[] = [
  { page: 1, label: "[F1] 🤖 Chat Engine" },
  { page: 2, label: "[F2] ⚙ Skill Builder" },
  { page: 3, label: "[F3] 🔌 MCP Manager" },
];

/** Outer chrome: matrix header, tab bar, page body, and the live footer. */
export function Shell({
  page,
  footer,
  children,
  gradient,
}: {
  page: Page;
  footer: React.ReactNode;
  children: React.ReactNode;
  gradient: string;
}): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={1} width={78}>
      <Gradient name={gradient as never}>
        <Text>{HEADER.join("\n")}</Text>
      </Gradient>
      <Text color={theme.accent}>{DRULE}</Text>

      <Box>
        {TABS.map((t, i) => (
          <Text key={t.page} color={page === t.page ? theme.accentBright : theme.muted} bold={page === t.page}>
            {`${i > 0 ? "  │  " : ""}${page === t.page ? "►" : " "}${t.label}`}
          </Text>
        ))}
      </Box>
      <Text dimColor>PerezDev Hub v2.0 · F1/F2/F3 switch pages · Esc back to chat</Text>
      <Text dimColor>{"─".repeat(74)}</Text>

      <Box flexDirection="column" marginY={1}>
        {children}
      </Box>

      <Text dimColor>{"─".repeat(74)}</Text>
      {footer}
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
      <Text color={theme.accent}>◆ {label}</Text>
      <Text dimColor>{`  │  F1-F3 page  │  Autonomy: ${autonomy}  │  Thinking: ${thinking}  │  ${status}`}</Text>
    </Text>
  );
}
