import React from "react";
import { Box, Text, useStdout } from "ink";
import { theme } from "./theme.js";
import { StatusBar, type StatusProps } from "./statusbar.js";
import { version as VERSION } from "./version.js";
import { HUB_TABS, type Page } from "./tabs.js";

export type { Page };

/** Header (brand · tabs · model) / body / status. No sidebar. */
export function Shell({
  page,
  online,
  footer,
  children,
}: {
  page: Page;
  online: boolean;
  footer: StatusProps;
  children: React.ReactNode;
}): React.ReactElement {
  const { stdout } = useStdout();
  const cols = stdout?.columns ? Math.min(stdout.columns, 132) : undefined;

  return (
    <Box flexDirection="column" width={cols}>
      <Box paddingX={2} borderStyle="round" borderColor={theme.line}>
        <Box flexGrow={0}>
          <Text color={theme.accent}>◤ </Text>
          <Text bold color={theme.accent}>
            PEREZDEV HUB
          </Text>
          <Text color={theme.muted}>{`  v${VERSION}`}</Text>
        </Box>
        <Box flexGrow={1} justifyContent="center">
          {HUB_TABS.map((t, i) => {
            const on = page === t.page;
            return (
              <Box key={t.page} marginLeft={i ? 1 : 0}>
                {on ? (
                  <Text backgroundColor={theme.accent} color={theme.ink} bold>{` ${t.label} `}</Text>
                ) : (
                  <Text color={theme.muted}>{` ${t.label} `}</Text>
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

      <Box flexGrow={1} flexDirection="column" paddingX={2}>
        {children}
      </Box>

      <StatusBar {...footer} />
    </Box>
  );
}
