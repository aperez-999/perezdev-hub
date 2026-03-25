import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";
import type { Autonomy, Mode, Thinking } from "./components.js";

/** Live state shared by the header model pill, the rail, and the status bar. */
export interface StatusProps {
  model: string;
  status: string;
  mode: Mode;
  autonomy: Autonomy;
  thinking: Thinking;
}

/** Bottom status bar: model fill · mode · autonomy · thinking · help hint.
 *  Kept compact (no greedy flexGrow) so segments never get truncated on an
 *  ~80–100 col terminal; the full keymap lives in the `?` help overlay. */
export function StatusBar({ model, mode, autonomy, thinking }: StatusProps): React.ReactElement {
  return (
    <Box paddingX={1}>
      <Text backgroundColor={theme.violet} color={theme.ink} bold>
        {` ◆ ${model} `}
      </Text>
      <Text color={mode === "plan" ? theme.violet : theme.accent} bold>
        {`  ${mode === "plan" ? "PLANNING" : "NORMAL"}`}
      </Text>
      <Text color={theme.muted}>{"  ·  autonomy "}</Text>
      <Text color={autonomy === "auto" ? theme.ok : theme.fg2}>{autonomy}</Text>
      <Text color={theme.muted}>{"  ·  thinking "}</Text>
      <Text color={theme.fg2}>{thinking}</Text>
      <Text color={theme.dim}>{"   ·   ? help"}</Text>
    </Box>
  );
}
