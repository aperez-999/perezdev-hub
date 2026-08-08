import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";

/** Inline model picker overlay (Ctrl+M). */
export function ModelPicker({
  models,
  sel,
  active,
}: {
  models: string[];
  sel: number;
  active: string;
}): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={theme.dim}>SELECT MODEL</Text>
      {models.length === 0 ? (
        <Text color={theme.muted}>no models — /pull one or set a cloud key</Text>
      ) : (
        models.map((m, i) => (
          <Box key={m}>
            <Box width={2} flexShrink={0}>
              <Text color={theme.accent}>{i === sel ? "›" : " "}</Text>
            </Box>
            <Text color={i === sel ? theme.accent : theme.fg2} bold={i === sel}>
              {m}
            </Text>
            {m === active && <Text color={theme.ok}>{"  ● active"}</Text>}
          </Box>
        ))
      )}
      <Box marginTop={1}>
        <Text color={theme.dim}>↑↓ move · enter select · esc cancel</Text>
      </Box>
    </Box>
  );
}
