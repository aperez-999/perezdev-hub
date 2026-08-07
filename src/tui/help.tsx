import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";
import { SectionHeader } from "./components.js";
import { COMMANDS } from "./commands.js";

const KEYS: [string, string][] = [
  ["Shift+← / Shift+→", "Previous / next page (always)"],
  ["F1 / F2 / F3", "Same pages (legacy)"],
  ["Shift+Tab", "Toggle Normal / Planning mode"],
  ["Ctrl+A", "Cycle autonomy (manual / auto)"],
  ["Ctrl+T", "Cycle thinking (low / med / high)"],
  ["Ctrl+M", "Open the model picker"],
  ["/", "Open slash-command autocomplete"],
  ["Tab", "Cycle focus / complete slash command"],
  ["↑ / ↓", "Move selection"],
  ["Enter", "Submit / run / install"],
  ["? ", "Toggle this help"],
  ["Esc", "Close overlay / back to Chat"],
];

/** Full-screen help overlay (terminals can't dim-and-float): keys + slash table. */
export function HelpOverlay(): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <SectionHeader label="help" color={theme.violet} />
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
