import React from "react";
import { Box, Text, useStdout } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { theme, BUILDER_FORM_W } from "../theme.js";
import { SKILLS_GOAL, SKILLS_PREVIEW_EMPTY, SKILLS_TOOLS } from "../copy.js";
import type { HomeData } from "../data.js";
import type { ToolId } from "../../core/agent-spec.js";

export type FactoryFocus = "goal" | "tools" | "generate";

export interface ToolChip {
  id: ToolId;
  label: string;
  on: boolean;
  present: boolean;
}

function tint(line: string): string {
  if (/^#{1,6}\s/.test(line)) return theme.violet;
  if (/^---\s*$/.test(line)) return theme.faint;
  if (/^\s*([-*]|\d+\.)\s/.test(line)) return theme.fg;
  if (/^[\w-]+:\s/.test(line)) return theme.fg2;
  return theme.fg2;
}

/** Page 2 — describe an agent, pick tools, generate. Presets stay auto. */
export function FactoryPage({
  goal,
  setGoal,
  onSubmitGoal,
  tools,
  toolIdx,
  focus,
  preview,
  busy,
  home,
}: {
  goal: string;
  setGoal: (s: string) => void;
  onSubmitGoal: (s: string) => void;
  tools: ToolChip[];
  toolIdx: number;
  focus: FactoryFocus;
  preview: string;
  busy: boolean;
  home: HomeData | null;
}): React.ReactElement {
  const { stdout } = useStdout();
  const rows = Math.max(8, Math.min((stdout?.rows ?? 40) - 14, 26));
  const lines = (preview ? preview.split("\n") : []).slice(0, rows);
  const agents = home?.agents ?? [];
  const wide = (stdout?.columns ?? 100) >= 116;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginTop={1} flexGrow={1} flexDirection={wide ? "row" : "column"}>
        <Box flexDirection="column" width={wide ? BUILDER_FORM_W : undefined} flexShrink={0}>
          <Text color={theme.dim}>{SKILLS_GOAL}</Text>
          <Box borderStyle="round" borderColor={focus === "goal" ? theme.accent : theme.line} paddingX={1}>
            <Text color={theme.violet}>{"› "}</Text>
            <TextInput
              value={goal}
              onChange={setGoal}
              onSubmit={onSubmitGoal}
              focus={focus === "goal"}
              placeholder="frontend reviewer who checks a11y"
            />
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text color={theme.dim}>{SKILLS_TOOLS}</Text>
            <Box flexWrap="wrap">
              {tools.map((t, i) => {
                const here = focus === "tools" && i === toolIdx;
                const color = here ? theme.accent : t.on ? theme.fg : t.present ? theme.fg2 : theme.muted;
                return (
                  <Box key={t.id} marginRight={1}>
                    <Text color={color} bold={here}>
                      {`${t.on ? "● " : "○ "}${t.label}${t.present && !t.on ? " · in" : ""}`}
                    </Text>
                  </Box>
                );
              })}
              {tools.length === 0 && <Text color={theme.muted}>none detected</Text>}
            </Box>
          </Box>

          <Box marginTop={1}>
            {focus === "generate" ? (
              <Text backgroundColor={theme.violet} color={theme.ink} bold>
                {" Generate "}
              </Text>
            ) : (
              <Text color={theme.muted}>{"[ Generate ]"}</Text>
            )}
          </Box>

          {agents.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.dim}>installed</Text>
              {agents.slice(0, 8).map((a) => (
                <Text key={a.name} color={theme.ok} wrap="truncate-end">
                  {`• ${a.name} `}
                  <Text color={theme.muted}>{`(${a.targets.join("/")} · v${a.version})`}</Text>
                </Text>
              ))}
            </Box>
          )}
        </Box>

        <Box
          flexDirection="column"
          flexGrow={1}
          marginLeft={wide ? 2 : 0}
          marginTop={wide ? 0 : 1}
          borderStyle="round"
          borderColor={theme.line}
          paddingX={1}
        >
          <Text color={theme.dim}>preview</Text>
          {lines.length === 0 && !busy && <Text color={theme.muted}>{SKILLS_PREVIEW_EMPTY}</Text>}
          {lines.map((l, i) => (
            <Text key={i} color={tint(l)} wrap="truncate-end">
              {l || " "}
            </Text>
          ))}
          {busy && (
            <Box>
              <Text color={theme.violet}>
                <Spinner type="dots" />
              </Text>
              <Text color={theme.fg2}>{" generating…"}</Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
