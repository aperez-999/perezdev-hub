import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";
import type { HomeData } from "./data.js";
import type { EcoTool } from "../core/ecosystem.js";

export interface Routing {
  normal: string;
  planning: string;
}

/** Persistent left environment rail: IDE/CLI/Ollama detection, project
 *  signals, and model routing — always visible on every page, from a real scan. */
export function EnvRail({
  home,
  ollama,
  routing,
}: {
  home: HomeData | null;
  ollama: boolean;
  routing: Routing;
}): React.ReactElement {
  const eco = home?.ecosystem ?? [];
  const ide = eco.filter((t) => t.kind === "ide");
  const cli = eco.filter((t) => t.kind === "cli");
  const dot = (on: boolean) => (on ? <Text color={theme.ok}>●</Text> : <Text color={theme.faint}>○</Text>);
  const row = (t: EcoTool) => (
    <Box key={t.id}>
      <Box width={2} flexShrink={0}>
        {dot(t.present)}
      </Box>
      <Text color={t.present ? theme.fg : theme.muted}>{t.label}</Text>
    </Box>
  );
  const signals = home?.scan.signals ?? [];
  return (
    <Box
      flexDirection="column"
      paddingX={1}
      borderStyle="single"
      borderColor={theme.line}
      borderTop={false}
      borderBottom={false}
      borderLeft={false}
    >
      <Text color={theme.dim}>ENVIRONMENT</Text>
      <Text color={theme.faint}>IDES</Text>
      {ide.length ? ide.map(row) : <Text color={theme.muted}> —</Text>}
      <Text color={theme.faint}>CLIS</Text>
      {cli.map(row)}
      <Box>
        <Box width={2} flexShrink={0}>{dot(ollama)}</Box>
        <Text color={ollama ? theme.fg : theme.muted}>ollama</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.dim}>PROJECT</Text>
        <Text color={theme.fg2} wrap="wrap">
          {signals.length ? signals.join(" · ") : "—"}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.dim}>ROUTING</Text>
        <Box justifyContent="space-between">
          <Text color={theme.muted}>normal</Text>
          <Text color={theme.accent}>{routing.normal}</Text>
        </Box>
        <Box justifyContent="space-between">
          <Text color={theme.muted}>planning</Text>
          <Text color={theme.violet}>{routing.planning}</Text>
        </Box>
      </Box>
    </Box>
  );
}
