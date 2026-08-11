import React from "react";
import { Box, Text, useStdout } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { theme, MCP_PANEL_W } from "../theme.js";
import { Row, type LogLine } from "../components.js";
import { MCP_CUSTOM_PLACEHOLDER, MCP_DISCOVER } from "../copy.js";
import type { HomeData } from "../data.js";

export type McpFocus = "list" | "button" | "input";

export interface DirectoryItem {
  label: string;
  id: string;
  tag: string;
}

export const MCP_DIRECTORY: DirectoryItem[] = [
  { label: "Local Filesystem", id: "filesystem", tag: "files" },
  { label: "SQLite Database", id: "sqlite", tag: "db" },
  { label: "PostgreSQL Database", id: "postgres", tag: "db" },
  { label: "Web Browser Search", id: "brave-search", tag: "web" },
  { label: "Docker Environment", id: "docker", tag: "infra" },
  { label: "Puppeteer Automation", id: "puppeteer", tag: "e2e" },
  { label: "Memory Context", id: "memory", tag: "ctx" },
  { label: "GitHub / Atlassian", id: "github", tag: "git" },
];

export type McpPanel =
  | { kind: "empty" }
  | { kind: "scan"; items: { id: string; reason: string }[] }
  | { kind: "json"; id: string; text: string };

/** Page 3 — pick a server, Enter installs. Discover is secondary. */
export function McpPage({
  home,
  staging,
  busy,
  sel,
  focus,
  panel,
  mcpInput,
  setMcpInput,
  onMcpSubmit,
}: {
  home: HomeData | null;
  staging: LogLine[];
  busy: boolean;
  sel: number;
  focus: McpFocus;
  panel: McpPanel;
  mcpInput: string;
  setMcpInput: (s: string) => void;
  onMcpSubmit: (s: string) => void;
}): React.ReactElement {
  const registered = new Set((home?.mcp ?? []).map((m) => m.id));
  const { stdout } = useStdout();
  const wide = (stdout?.columns ?? 100) >= 116;
  const showLog = staging.length > 0 || busy;
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginTop={1} flexGrow={1} flexDirection={wide ? "row" : "column"}>
        <Box flexDirection="column" flexGrow={1}>
          {MCP_DIRECTORY.map((it, i) => {
            const on = focus === "list" && i === sel;
            const reg = registered.has(it.id);
            return (
              <Box key={it.id}>
                <Box width={2} flexShrink={0}>
                  <Text color={on ? theme.accent : theme.faint}>{on ? "›" : " "}</Text>
                </Box>
                <Text color={reg ? theme.ok : theme.faint}>{reg ? "● " : "○ "}</Text>
                <Box width={22} flexShrink={0}>
                  <Text color={on ? theme.accent : reg ? theme.fg : theme.fg2} bold={on}>
                    {it.label}
                  </Text>
                </Box>
                <Box flexGrow={1} justifyContent="flex-end">
                  <Text color={reg ? theme.ok : theme.dim}>{reg ? "installed" : "install"}</Text>
                </Box>
              </Box>
            );
          })}

          <Box marginTop={1}>
            <Text
              color={focus === "button" ? theme.accent : theme.muted}
              bold={focus === "button"}
              wrap="truncate-end"
            >
              {`${focus === "button" ? "› " : "  "}${MCP_DISCOVER}`}
            </Text>
          </Box>

          <Box marginTop={1} borderStyle="round" borderColor={focus === "input" ? theme.accent : theme.line} paddingX={1}>
            <Text color={theme.accent}>{"› "}</Text>
            <TextInput
              value={mcpInput}
              onChange={setMcpInput}
              onSubmit={onMcpSubmit}
              focus={focus === "input"}
              placeholder={MCP_CUSTOM_PLACEHOLDER}
            />
          </Box>
        </Box>

        {panel.kind !== "empty" && (
          <Box
            flexDirection="column"
            width={wide ? MCP_PANEL_W : undefined}
            flexShrink={0}
            marginLeft={wide ? 2 : 0}
            marginTop={wide ? 0 : 1}
            borderStyle="round"
            borderColor={theme.line}
            paddingX={1}
          >
            {panel.kind === "scan" && (
              <>
                <Text color={theme.dim}>recommended</Text>
                {panel.items.length === 0 ? (
                  <Text color={theme.muted}>nothing new</Text>
                ) : (
                  panel.items.map((r) => (
                    <Box key={r.id} flexDirection="column" marginTop={1}>
                      <Text color={theme.accent} bold>
                        {`+ ${r.id}`}
                      </Text>
                      <Text color={theme.fg2} wrap="wrap">
                        {r.reason}
                      </Text>
                    </Box>
                  ))
                )}
              </>
            )}
            {panel.kind === "json" && (
              <>
                <Text color={theme.dim}>{panel.id}</Text>
                {panel.text.split("\n").slice(0, 18).map((l, i) => (
                  <Text key={i} color={/"[\w-]+":/.test(l) ? theme.accent : theme.fg2} wrap="truncate-end">
                    {l || " "}
                  </Text>
                ))}
              </>
            )}
          </Box>
        )}
      </Box>

      {showLog && (
        <Box flexDirection="column" marginTop={1}>
          {staging.slice(-3).map((l, i) => (
            <Row key={i} line={l} />
          ))}
          {busy && (
            <Box>
              <Text color={theme.accent}>
                <Spinner type="dots" />
              </Text>
              <Text color={theme.fg2}>{" compiling…"}</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
