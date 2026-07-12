import React from "react";
import { Box, Text, useStdout } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { theme, BUILDER_FORM_W } from "../theme.js";
import { SectionHeader } from "../components.js";
import type { HomeData } from "../data.js";
import type { ToolId } from "../../core/agent-spec.js";

export type FactoryFocus = "goal" | "tools" | "gen" | "generate";
export const GEN_PRESETS = ["auto", "strict", "minimal"] as const;
export type GenPreset = (typeof GEN_PRESETS)[number];

export interface ToolChip {
  id: ToolId;
  label: string;
  on: boolean;
}

/** Light syntax tint for the streaming SKILL.md preview. */
function tint(line: string): string {
  if (/^#{1,6}\s/.test(line)) return theme.violet;
  if (/^---\s*$/.test(line)) return theme.faint;
  if (/^\s*([-*]|\d+\.)\s/.test(line)) return theme.fg;
  if (/^[\w-]+:\s/.test(line)) return theme.fg2;
  return theme.fg2;
}

/** Page 2 — Skill Builder: a compose form (left) + a live SKILL.md preview (right). */
export function FactoryPage({
  goal,
  setGoal,
  onSubmitGoal,
  tools,
  toolIdx,
  presetSel,
  genIdx,
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
  presetSel: GenPreset;
  genIdx: number;
  focus: FactoryFocus;
  preview: string;
  busy: boolean;
  home: HomeData | null;
}): React.ReactElement {
  const { stdout } = useStdout();
  const rows = Math.max(8, Math.min((stdout?.rows ?? 40) - 14, 26));
  const lines = (preview ? preview.split("\n") : []).slice(0, rows);
  const agents = home?.agents ?? [];
  // Two-pane compose + preview needs ~116 cols; below that, stack the preview.
  const wide = (stdout?.columns ?? 100) >= 116;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <SectionHeader label="skill builder" color={theme.violet} />
      <Box marginTop={1} flexGrow={1} flexDirection={wide ? "row" : "column"}>
        {/* ── compose column ── */}
        <Box flexDirection="column" width={wide ? BUILDER_FORM_W : undefined} flexShrink={0}>
          <Text color={theme.dim}>GOAL</Text>
          <Box borderStyle="round" borderColor={focus === "goal" ? theme.accent : theme.line} paddingX={1}>
            <Text color={theme.violet}>{"› "}</Text>
            <TextInput
              value={goal}
              onChange={setGoal}
              onSubmit={onSubmitGoal}
              focus={focus === "goal"}
              placeholder="describe the agent…"
            />
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text color={theme.dim}>TARGET TOOLS</Text>
            <Box flexWrap="wrap">
              {tools.map((t, i) => {
                const here = focus === "tools" && i === toolIdx;
                const color = here ? theme.accent : t.on ? theme.fg : theme.muted;
                return (
                  <Box key={t.id} marginRight={1}>
                    <Text color={color} bold={here}>
                      {t.on ? "● " : "○ "}
                      {t.label}
                    </Text>
                  </Box>
                );
              })}
              {tools.length === 0 && <Text color={theme.muted}>— none detected</Text>}
            </Box>
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text color={theme.dim}>GENERATION</Text>
            <Box>
              {GEN_PRESETS.map((p, i) => {
                const here = focus === "gen" && i === genIdx;
                const on = p === presetSel;
                return (
                  <Box key={p} marginRight={1}>
                    {on ? (
                      <Text backgroundColor={theme.accent} color={theme.ink} bold>{` ${p} `}</Text>
                    ) : (
                      <Text color={here ? theme.accent : theme.muted} bold={here}>{` ${p} `}</Text>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>

          <Box marginTop={1}>
            {focus === "generate" ? (
              <Text backgroundColor={theme.violet} color={theme.ink} bold>{" Generate & Install "}</Text>
            ) : (
              <Text color={theme.muted}>{"[ Generate & Install ]"}</Text>
            )}
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text color={theme.dim}>PROJECT SKILLS</Text>
            {agents.length === 0 ? (
              <Text color={theme.muted}>none installed yet</Text>
            ) : (
              agents.slice(0, 5).map((a) => (
                <Text key={a.name} color={theme.ok} wrap="truncate-end">
                  {`• ${a.name} `}
                  <Text color={theme.muted}>{`(${a.targets.join("/")} · v${a.version})`}</Text>
                </Text>
              ))
            )}
          </Box>
        </Box>

        {/* ── live preview ── */}
        <Box
          flexDirection="column"
          flexGrow={1}
          marginLeft={wide ? 2 : 0}
          marginTop={wide ? 0 : 1}
          borderStyle="round"
          borderColor={theme.line}
          paddingX={1}
        >
          <Text color={theme.dim}>SKILL.md PREVIEW</Text>
          {lines.length === 0 && !busy && <Text color={theme.muted}>type a goal, then Generate…</Text>}
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
      <Box paddingX={0} marginTop={1}>
        <Text color={theme.dim}>Tab move field · Space toggle tool · ←/→ adjust · Enter generate & install</Text>
      </Box>
    </Box>
  );
}
