import React from "react";
import { Box, Text, useStdout } from "ink";
import { theme } from "../theme.js";
import { SectionHeader } from "../components.js";
import { version as VERSION } from "../version.js";
import type { HomeData } from "../data.js";
import type { Routing } from "../rail.js";

const ENGINES: { key: string; name: string; blurb: string }[] = [
  {
    key: "1",
    name: "Chat Engine",
    blurb: "Chat with local Ollama or cloud models. Run /commands, attach files with @path, toggle Planning for a thinking model.",
  },
  {
    key: "2",
    name: "Skill Builder",
    blurb: "Describe an agent; generate its SKILL.md and install it into your detected tools (Claude Code, Cursor, Copilot, Codex).",
  },
  {
    key: "3",
    name: "MCP Manager",
    blurb: "Browse curated MCP servers, scan this repo for recommendations, then compile and install configs for your tools.",
  },
];

const NAV: [string, string][] = [
  ["Ctrl+← / Ctrl+→", "Move to the previous / next page"],
  ["1 · 2 · 3 · 4", "Jump straight to a page (when not typing)"],
  ["Shift+Tab", "Toggle Normal / Planning mode"],
  ["Ctrl+M", "Pick a model  ·  Ctrl+A autonomy  ·  Ctrl+T thinking"],
  ["?  ·  Esc", "Full help  ·  back to Chat"],
];

const TRY: string[] = [
  "/build a code reviewer for my repo",
  "/mcp auto",
  "/recommend",
  "/pull qwen2.5-coder",
];

/** Page 4 — Quick Start: an onboarding overview of what the hub does, how to
 *  navigate it, and a few commands to try. Reachable any time via 4 / Ctrl+→. */
export function QuickStartPage({
  home,
  online,
  model,
  routing,
}: {
  home: HomeData | null;
  online: boolean;
  model: string;
  routing: Routing;
}): React.ReactElement {
  const { stdout } = useStdout();
  const wide = (stdout?.columns ?? 100) >= 116;
  const tools = home?.targets ?? [];

  const engines = (
    <Box flexDirection="column">
      <Text color={theme.dim}>THE THREE ENGINES</Text>
      {ENGINES.map((e) => (
        <Box key={e.key} marginTop={1}>
          <Box width={3} flexShrink={0}>
            <Text color={theme.accent} bold>
              {e.key}
            </Text>
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            <Text color={theme.fg} bold>
              {e.name}
            </Text>
            <Text color={theme.fg2} wrap="wrap">
              {e.blurb}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );

  const nav = (
    <Box flexDirection="column">
      <Text color={theme.dim}>NAVIGATION</Text>
      {NAV.map(([k, d]) => (
        <Box key={k}>
          <Box width={18} flexShrink={0}>
            <Text color={theme.violet}>{k}</Text>
          </Box>
          <Text color={theme.fg2} wrap="truncate-end">
            {d}
          </Text>
        </Box>
      ))}
    </Box>
  );

  const tryIt = (
    <Box flexDirection="column">
      <Text color={theme.dim}>TRY THESE (on the Chat page)</Text>
      {TRY.map((c) => (
        <Box key={c}>
          <Text color={theme.accent}>{"› "}</Text>
          <Text color={theme.fg}>{c}</Text>
        </Box>
      ))}
    </Box>
  );

  const statusCard = (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.line}
      paddingX={1}
    >
      <Text color={theme.dim}>YOUR SETUP</Text>
      <Box>
        <Box width={12} flexShrink={0}>
          <Text color={theme.muted}>model</Text>
        </Box>
        <Text color={online ? theme.violet : theme.muted} bold>
          {model}
        </Text>
        <Text color={online ? theme.ok : theme.warn}>{online ? "  ● ready" : "  ○ offline"}</Text>
      </Box>
      <Box>
        <Box width={12} flexShrink={0}>
          <Text color={theme.muted}>routing</Text>
        </Box>
        <Text color={theme.fg2}>{`normal ${routing.normal} · plan ${routing.planning}`}</Text>
      </Box>
      <Box>
        <Box width={12} flexShrink={0}>
          <Text color={theme.muted}>tools</Text>
        </Box>
        <Text color={theme.fg2}>{tools.length ? tools.join(" · ") : "none detected — run perezdev init"}</Text>
      </Box>
      {!online && (
        <Box marginTop={1}>
          <Text color={theme.warn} wrap="wrap">
            No model yet. Run{" "}
            <Text bold>ollama pull qwen2.5-coder</Text> or set ANTHROPIC_API_KEY / OPENAI_API_KEY.
          </Text>
        </Box>
      )}
    </Box>
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      <SectionHeader label="quick start" color={theme.violet} />
      <Box marginTop={1}>
        <Text color={theme.fg2} wrap="wrap">
          Welcome to PerezDev Hub{` v${VERSION}`} — your local-first control room for AI coding
          tools. Generate agents, install MCP servers, and chat with local or cloud models, all
          from the terminal.
        </Text>
      </Box>

      <Box marginTop={1} flexDirection={wide ? "row" : "column"}>
        <Box flexDirection="column" flexGrow={1} flexBasis={0}>
          {engines}
        </Box>
        <Box
          flexDirection="column"
          flexGrow={1}
          flexBasis={0}
          marginLeft={wide ? 3 : 0}
          marginTop={wide ? 0 : 1}
        >
          {nav}
          <Box marginTop={1}>{tryIt}</Box>
        </Box>
      </Box>

      {statusCard}
    </Box>
  );
}
