import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";
import type { HomeData } from "./data.js";
import type { EcoTool } from "../core/ecosystem.js";

export interface Routing {
  normal: string;
  planning: string;
}

/** Compact rail for Skills/MCP: present tools and stack only — no empty catalog. */
export function EnvRail({
  home,
  ollama,
}: {
  home: HomeData | null;
  ollama: boolean;
  routing: Routing;
}): React.ReactElement {
  const eco = home?.ecosystem ?? [];
  const present = eco.filter((t) => t.present);
  const ide = present.filter((t) => t.kind === "ide");
  const cli = present.filter((t) => t.kind === "cli");
  const row = (t: EcoTool) => (
    <Box key={t.id}>
      <Box width={2} flexShrink={0}>
        <Text color={theme.ok}>●</Text>
      </Box>
      <Text color={theme.fg}>{t.label}</Text>
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
      <Text color={theme.dim}>DETECTED</Text>
      {ide.map(row)}
      {cli.map(row)}
      <Box>
        <Box width={2} flexShrink={0}>
          <Text color={ollama ? theme.ok : theme.faint}>{ollama ? "●" : "○"}</Text>
        </Box>
        <Text color={ollama ? theme.fg : theme.muted}>ollama</Text>
      </Box>
      {ide.length === 0 && cli.length === 0 && !ollama && (
        <Text color={theme.muted}>none yet</Text>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.dim}>PROJECT</Text>
        <Text color={theme.fg2} wrap="wrap">
          {signals.length ? signals.join(" · ") : "—"}
        </Text>
      </Box>
    </Box>
  );
}
