import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { theme } from "../theme.js";
import { Row, type LogLine } from "../components.js";
import type { HomeData } from "../data.js";

export type McpFocus = "list" | "button" | "input";

export interface DirectoryItem {
  icon: string;
  label: string;
  id: string;
}

/** The industry MCP server directory shown on Page 3. */
export const MCP_DIRECTORY: DirectoryItem[] = [
  { icon: "📁", label: "Local Filesystem", id: "filesystem" },
  { icon: "🗄", label: "SQLite Database", id: "sqlite" },
  { icon: "🐘", label: "PostgreSQL Database", id: "postgres" },
  { icon: "🌐", label: "Web Browser Search", id: "brave-search" },
  { icon: "🐳", label: "Docker Environment", id: "docker" },
  { icon: "🎭", label: "Puppeteer Automation", id: "puppeteer" },
  { icon: "🧠", label: "Memory Context", id: "memory" },
  { icon: "🐙", label: "GitHub / Atlassian", id: "github" },
];

/** Page 3 — universal MCP manager: directory matrix, custom prompt, staging. */
export function McpPage({
  home,
  staging,
  busy,
  sel,
  focus,
  mcpInput,
  setMcpInput,
  onMcpSubmit,
}: {
  home: HomeData | null;
  staging: LogLine[];
  busy: boolean;
  sel: number;
  focus: McpFocus;
  mcpInput: string;
  setMcpInput: (s: string) => void;
  onMcpSubmit: (s: string) => void;
}): React.ReactElement {
  const registered = new Set((home?.mcp ?? []).map((m) => m.id));
  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>INDUSTRY SERVER DIRECTORY  <Text dimColor>(↑↓ select · Enter install · Tab focus)</Text></Text>
      <Box flexDirection="column">
        {MCP_DIRECTORY.map((it, i) => {
          const on = focus === "list" && i === sel;
          const reg = registered.has(it.id);
          return (
            <Text key={it.id} color={on ? theme.accentBright : undefined} bold={on}>
              {`${on ? "►" : " "} `}
              <Text color={reg ? theme.ok : theme.muted}>{reg ? "●" : "○"}</Text>
              {` ${it.icon} ${it.label}`}
            </Text>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text color={focus === "button" ? theme.accentBright : theme.muted} bold={focus === "button"}>
          {`${focus === "button" ? "►" : " "} [ Run Discovery Scanner ] `}
        </Text>
        <Text dimColor>Enter scans this workspace</Text>
      </Box>

      <Box
        marginTop={1}
        borderStyle="round"
        borderColor={focus === "input" ? theme.accent : theme.muted}
        paddingX={1}
      >
        <Text color={theme.accentBright}>{"› "}</Text>
        <TextInput
          value={mcpInput}
          onChange={setMcpInput}
          onSubmit={onMcpSubmit}
          focus={focus === "input"}
          placeholder="Connect custom server or type integration prompt..."
        />
      </Box>

      <Box flexDirection="column" marginTop={1} height={5}>
        <Text bold color={theme.accent}>[MCP STAGING STREAM]</Text>
        {staging.slice(-3).map((l, i) => (
          <Row key={i} line={l} />
        ))}
        {busy && (
          <Text>
            <Text color={theme.accent}>
              <Spinner type="dots" />
            </Text>{" "}
            <Text dimColor>compiling…</Text>
          </Text>
        )}
      </Box>
    </Box>
  );
}
