import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";
import { COMMANDS } from "./commands.js";

const KEYS: [string, string][] = [
  ["Shift+← / →", "Chat / Skills / MCP / News"],
  ["Shift+Tab", "Normal ↔ Planning"],
  ["Ctrl+M", "Pick model"],
  ["Ctrl+A", "Manual ↔ local auto"],
  ["Ctrl+T", "Reply length (local)"],
  ["/", "Slash commands"],
  ["?", "This help (empty prompt)"],
  ["Esc", "Close / back to Chat"],
  ["F1–F4", "Pages (legacy)"],
];

/** Full-screen help overlay (terminals can't dim-and-float). */
export function HelpOverlay(): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text>
        <Text color={theme.violet}>{"▌ "}</Text>
        <Text bold color={theme.fg2}>
          HELP
        </Text>
      </Text>
      <Box marginTop={1}>
        <Box flexDirection="column" width={42} flexShrink={0}>
          <Text color={theme.dim}>KEYS</Text>
          {KEYS.map(([k, d]) => (
            <Box key={k}>
              <Box width={16} flexShrink={0}>
                <Text color={theme.accent}>{k}</Text>
              </Box>
              <Text color={theme.fg2}>{d}</Text>
            </Box>
          ))}
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <Text color={theme.dim}>SLASH COMMANDS</Text>
          {COMMANDS.map((c) => (
            <Box key={c.name}>
              <Box width={26} flexShrink={0}>
                <Text color={theme.accent}>{c.usage}</Text>
              </Box>
              <Text color={theme.fg2}>{c.help}</Text>
            </Box>
          ))}
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.dim}>esc to close</Text>
      </Box>
    </Box>
  );
}
