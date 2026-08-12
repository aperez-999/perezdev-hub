import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";
import { EMPTY_CHAT, EMPTY_CHAT_HINT } from "./copy.js";

export function EmptyChat(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.fg2}>{EMPTY_CHAT}</Text>
      <Text color={theme.dim}>{EMPTY_CHAT_HINT}</Text>
    </Box>
  );
}
