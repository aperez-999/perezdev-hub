import React from "react";
import { Box, Text, useStdout } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { theme, MCP_PANEL_W } from "../theme.js";
import { Row, SectionHeader, type LogLine } from "../components.js";
import type { HomeData } from "../data.js";

export type McpFocus = "list" | "button" | "input";

export interface DirectoryItem {
  label: string;
  id: string;
  tag: string;
}

/** The industry MCP server directory shown on Page 3. */
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

/** Right-panel content: discovery results, a compiled config, or empty. */
export type McpPanel =
  | { kind: "empty" }
  | { kind: "scan"; items: { id: string; reason: string }[] }
  | { kind: "json"; id: string; text: string };

/** Page 3 — MCP Manager: directory (left) + scanner / compiled-JSON panel (right). */
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
  // Side-by-side directory + panel needs ~116 cols (rail 28 + dir 46 + panel 40);
  // below that, stack the panel under the directory so neither column cramps.
  const wide = (stdout?.columns ?? 100) >= 116;
  return (
    <Box flexDirection="column" flexGrow={1}>
      <SectionHeader label="mcp manager" />
      <Box marginTop={1} flexGrow={1} flexDirection={wide ? "row" : "column"}>
        {/* ── directory ── */}
        <Box flexDirection="column" flexGrow={1}>
          {MCP_DIRECTORY.map((it, i) => {
            const on = focus === "list" && i === sel;
            const reg = registered.has(it.id);
            return (
              <Box key={it.id}>
                <Box width={2} flexShrink={0}>
                  <Text color={on ? theme.accent : theme.faint}>{on ? "►" : " "}</Text>
                </Box>
                <Text color={reg ? theme.ok : theme.faint}>{reg ? "● " : "○ "}</Text>
                <Box width={22} flexShrink={0}>
                  <Text color={on ? theme.accent : reg ? theme.fg : theme.fg2} bold={on}>
                    {it.label}
                  </Text>
                </Box>
                <Text color={theme.muted}>{`[${it.tag}] `}</Text>
                <Box flexGrow={1} justifyContent="flex-end">
                  <Text color={reg ? theme.ok : theme.dim}>{reg ? "installed" : "install"}</Text>
                </Box>
              </Box>
            );
          })}

          <Box marginTop={1}>
            <Text
              color={focus === "button" ? theme.accent : theme.muted}
              backgroundColor={focus === "button" ? theme.panel : undefined}
              bold={focus === "button"}
              wrap="truncate-end"
            >
              {`${focus === "button" ? "►" : " "} [ Run Discovery Scanner ]`}
            </Text>
            <Text color={theme.dim}>{"  s"}</Text>
          </Box>

          <Box marginTop={1} borderStyle="round" borderColor={focus === "input" ? theme.accent : theme.line} paddingX={1}>
            <Text color={theme.accent}>{"› "}</Text>
            <TextInput
              value={mcpInput}
              onChange={setMcpInput}
              onSubmit={onMcpSubmit}
              focus={focus === "input"}
              placeholder="custom server or integration prompt…"
            />
          </Box>
        </Box>

        {/* ── context panel ── */}
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
          {panel.kind === "empty" && (
            <>
              <Text color={theme.dim}>SCANNER</Text>
              <Text color={theme.muted} wrap="wrap">
                Run the discovery scanner to see MCP servers recommended for this repo, or type a custom integration to compile a config.
              </Text>
            </>
          )}
          {panel.kind === "scan" && (
            <>
              <Text color={theme.dim}>RECOMMENDED FOR THIS REPO</Text>
              {panel.items.length === 0 ? (
                <Text color={theme.muted}>nothing new inferred</Text>
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
              <Text color={theme.dim}>{`mcpServers · ${panel.id}`}</Text>
              {panel.text.split("\n").slice(0, 18).map((l, i) => (
                <Text key={i} color={/"[\w-]+":/.test(l) ? theme.accent : theme.fg2} wrap="truncate-end">
                  {l || " "}
                </Text>
              ))}
            </>
          )}
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <SectionHeader label="staging" />
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
      <Box marginTop={1}>
        <Text color={theme.dim}>↑/↓ select · Enter install · Tab move focus · s run scanner</Text>
      </Box>
    </Box>
  );
}
