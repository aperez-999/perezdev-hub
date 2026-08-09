import React from "react";
import { Box, Text, useStdout } from "ink";
import Gradient from "ink-gradient";
import { theme, LOGO_GRADIENT, RAIL_W } from "./theme.js";
import { EnvRail, type Routing } from "./rail.js";
import { StatusBar, type StatusProps } from "./statusbar.js";
import type { HomeData } from "./data.js";
import { version as VERSION } from "./version.js";
import { HUB_TABS, type Page } from "./tabs.js";

export type { Page };

/** Header (brand · tabs · model) / body / status. Chat has no environment rail. */
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
  const cols = stdout?.columns ? Math.min(stdout.columns, 132) : undefined;
  const showRail = page !== 1;

  return (
    <Box flexDirection="column" width={cols}>
      <Box paddingX={2} borderStyle="round" borderColor={theme.line}>
        <Box flexGrow={0}>
          <Text color={theme.accent}>◤ </Text>
          <Gradient colors={LOGO_GRADIENT}>
            <Text bold>PEREZDEV HUB</Text>
          </Gradient>
          <Text color={theme.muted}>{`  v${VERSION}`}</Text>
        </Box>
        <Box flexGrow={1} justifyContent="center">
          {HUB_TABS.map((t, i) => {
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
        </Box>
        <Box flexGrow={0}>
          <Text color={online ? theme.ok : theme.muted}>● </Text>
          <Text color={theme.violet} bold>
            {footer.model}
          </Text>
        </Box>
      </Box>

      <Box>
        {showRail && (
          <Box width={RAIL_W} flexShrink={0}>
            <EnvRail home={home} ollama={ollama} routing={routing} />
          </Box>
        )}
        <Box flexGrow={1} flexDirection="column" paddingX={1}>
          {children}
        </Box>
      </Box>

      <StatusBar {...footer} />
    </Box>
  );
}
