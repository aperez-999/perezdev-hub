import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { theme } from "../theme.js";
import { Row, type LogLine } from "../components.js";
import type { HomeData } from "../data.js";

/** Page 3 — MCP server connection matrix, discovery trigger, and staging log. */
export function McpPage({
  home,
  staging,
  busy,
}: {
  home: HomeData | null;
  staging: LogLine[];
  busy: boolean;
}): React.ReactElement {
  const git = home?.scan.git ?? false;
  const conns: { label: string; on: boolean; note: string }[] = [
    { label: "[GitHub Link]", on: git, note: git ? "Repository remote paths verified" : "No git remote detected" },
    { label: "[Atlassian Link]", on: false, note: "Scan local workspace to authenticate" },
  ];
  const installed = home?.mcp ?? [];
  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>SYSTEM CONNECTION MATRIX:</Text>
      {conns.map((c) => (
        <Text key={c.label}>
          <Text color={c.on ? theme.ok : theme.muted}>{`${c.on ? "●" : "○"} ${c.label}`}</Text>
          <Text dimColor>{` → ${c.note}`}</Text>
        </Text>
      ))}
      <Text dimColor>{`  active servers: ${installed.length ? installed.map((m) => m.id).join(", ") : "none"}`}</Text>

      <Box marginTop={1}>
        <Text color={theme.accentBright} bold>{"► [ Run Discovery Scanner ] "}</Text>
        <Text dimColor>Enter to scan this workspace · /mcp auto</Text>
      </Box>

      <Box flexDirection="column" marginTop={1} height={6}>
        <Text bold color={theme.accent}>[MCP STAGING STREAM]</Text>
        {staging.slice(-3).map((l, i) => (
          <Row key={i} line={l} />
        ))}
        {busy && (
          <Text>
            <Text color={theme.accent}>
              <Spinner type="dots" />
            </Text>{" "}
            <Text dimColor>discovering...</Text>
          </Text>
        )}
      </Box>
    </Box>
  );
}
