import React from "react";
import { Box, Text, useStdout } from "ink";
import Gradient from "ink-gradient";
import { theme, LOGO_GRADIENT, RAIL_W } from "./theme.js";
import { EnvRail, type Routing } from "./rail.js";
import { StatusBar, type StatusProps } from "./statusbar.js";
import type { HomeData } from "./data.js";
import { version as VERSION } from "./version.js";

export type Page = 1 | 2 | 3 | 4;

const TABS: { page: Page; key: string; label: string }[] = [
  { page: 1, key: "1", label: "Chat" },
  { page: 2, key: "2", label: "Skills" },
  { page: 3, key: "3", label: "MCP" },
  { page: 4, key: "4", label: "Start" },
];

/** Three-zone shell: header (logo · tabs · model) / body (rail + page) / status bar. */
export function Shell({
  page,
  home,
  online,
  ollama,
  routing,
  footer,
  children,
}: {
  page: Page;
  home: HomeData | null;
  online: boolean;
  ollama: boolean;
  routing: Routing;
  footer: StatusProps;
  children: React.ReactNode;
}): React.ReactElement {
  const { stdout } = useStdout();
  // Constrain width only when the real terminal width is known; in headless
  // renders (tests) leave it natural so content lays out without hard wrapping.
  const cols = stdout?.columns ? Math.min(stdout.columns, 132) : undefined;

  return (
    <Box flexDirection="column" width={cols}>
      {/* ── header ── */}
      <Box paddingX={2} borderStyle="round" borderColor={theme.line}>
        <Box flexGrow={0}>
          <Text color={theme.accent}>◤ </Text>
          <Gradient colors={LOGO_GRADIENT}>
            <Text bold>PEREZDEV HUB</Text>
          </Gradient>
          <Text color={theme.muted}>{`  v${VERSION}`}</Text>
        </Box>
        <Box flexGrow={1} justifyContent="center">
          {TABS.map((t, i) => {
            const on = page === t.page;
            return (
              <Box key={t.page} marginLeft={i ? 1 : 0}>
                {on ? (
                  <Text backgroundColor={theme.accent} color={theme.ink} bold>{` ${t.key} ${t.label} `}</Text>
                ) : (
                  <Text color={theme.muted}>{` ${t.key} ${t.label} `}</Text>
                )}
              </Box>
            );
          })}
          <Box marginLeft={2}>
            <Text color={theme.dim}>{"⇄ Ctrl ←/→"}</Text>
          </Box>
        </Box>
        <Box flexGrow={0}>
          <Text color={online ? theme.ok : theme.muted}>● </Text>
          <Text color={theme.fg2}>{online ? "local " : "offline "}</Text>
          <Text color={theme.violet} bold>
            {footer.model}
          </Text>
        </Box>
      </Box>

      {/* ── body: rail + main ── */}
      <Box>
        <Box width={RAIL_W} flexShrink={0}>
          <EnvRail home={home} ollama={ollama} routing={routing} />
        </Box>
        <Box flexGrow={1} flexDirection="column" paddingX={1}>
          {children}
        </Box>
      </Box>

      {/* ── status bar ── */}
      <StatusBar {...footer} />
    </Box>
  );
}
