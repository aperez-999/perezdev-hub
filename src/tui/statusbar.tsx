import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";
import type { Autonomy, Mode, Thinking } from "./components.js";

/** Live state shared by the header model pill and the status bar. */
export interface StatusProps {
  model: string;
  status: string;
  mode: Mode;
  autonomy: Autonomy;
  thinking: Thinking;
}

/** Footer: mode · autonomy · thinking · help. Model lives in the header only. */
export function StatusBar({ mode, autonomy, thinking }: StatusProps): React.ReactElement {
  const think = thinking === "medium" ? "med" : thinking;
  return (
    <Box paddingX={2}>
      <Text color={mode === "plan" ? theme.violet : theme.accent} bold>
        {mode === "plan" ? "PLANNING" : "NORMAL"}
      </Text>
      <Text color={theme.muted}>{" · "}</Text>
      <Text color={autonomy === "auto" ? theme.ok : theme.fg2} bold={autonomy === "auto"}>
        {autonomy === "auto" ? "AUTO" : "manual"}
      </Text>
      <Text color={theme.muted}>{" · "}</Text>
      <Text color={theme.fg2}>{think}</Text>
      <Text color={theme.dim}>{" · ?"}</Text>
    </Box>
  );
}
