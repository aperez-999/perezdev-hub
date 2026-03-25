import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";
import { filterCommands } from "./commands.js";

/** Filtered slash-command list rendered in-flow above the chat input capsule.
 *  Terminals can't float, so it occupies real rows directly above the input. */
export function SlashMenu({ query, sel }: { query: string; sel: number }): React.ReactElement | null {
  const items = filterCommands(query);
  if (items.length === 0) return null;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.line} paddingX={1} marginX={2}>
      {items.slice(0, 8).map((c, i) => (
        <Box key={c.name}>
          <Box width={26} flexShrink={0}>
            <Text color={i === sel ? theme.accent : theme.fg2} bold={i === sel}>
              {i === sel ? "› " : "  "}
              {c.usage}
            </Text>
          </Box>
          <Text color={theme.muted}>{c.help}</Text>
        </Box>
      ))}
    </Box>
  );
}
