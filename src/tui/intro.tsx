import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import Gradient from "ink-gradient";
import Spinner from "ink-spinner";
import { theme, LOGO_GRADIENT } from "./theme.js";
import { version as VERSION } from "./version.js";

/** Boot steps shown as an animated checklist while the hub "warms up".
 *  Purely cosmetic — the real detection runs once the console mounts. */
const BOOT = [
  "scanning your environment",
  "detecting local + cloud models",
  "loading skills & MCP registry",
  "warming the chat engine",
] as const;

const LOGO = "PEREZDEV HUB";

// Frame timeline (each frame ≈ FRAME_MS). Derived phases keep a single timer.
const FRAME_MS = 80;
const LOGO_END = 9; // typewriter reveal of the logo
const BOOT_PER = 4; // frames spent on each boot line
const BOOT_END = LOGO_END + BOOT.length * BOOT_PER;
const QUICK_HOLD = 22; // frames the quick-start card lingers before entering
const DONE = BOOT_END + QUICK_HOLD;

const TABS: { key: string; label: string; blurb: string }[] = [
  { key: "1", label: "Chat Engine", blurb: "talk to local/cloud models · /commands · @files" },
  { key: "2", label: "Skill Builder", blurb: "generate custom agents for your tools" },
  { key: "3", label: "MCP Manager", blurb: "install & manage MCP servers" },
  { key: "4", label: "Quick Start", blurb: "this guide — reachable any time" },
];

/** Animated intro: logo build-up → boot checklist → quick-start card.
 *  Auto-advances on a timer; any key skips straight into the hub. */
export function Intro({ onDone }: { onDone: () => void }): React.ReactElement {
  const { stdout } = useStdout();
  const cols = stdout?.columns ? Math.min(stdout.columns, 132) : 80;
  const [frame, setFrame] = useState(0);
  const finished = useRef(false);

  const finish = (): void => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  };

  useEffect(() => {
    const id = setInterval(() => setFrame((f) => f + 1), FRAME_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (frame >= DONE) finish();
  }, [frame]);

  useInput(() => finish());

  const phase: "logo" | "boot" | "quick" =
    frame < LOGO_END ? "logo" : frame < BOOT_END ? "boot" : "quick";

  const typed =
    phase === "logo" ? Math.max(1, Math.ceil((LOGO.length * (frame + 1)) / LOGO_END)) : LOGO.length;
  const shownLogo = LOGO.slice(0, typed);
  const caret = phase === "logo" && frame % 2 === 0 ? "▋" : " ";

  const bootStep =
    phase === "logo" ? -1 : Math.min(BOOT.length, Math.floor((frame - LOGO_END) / BOOT_PER));

  const pct = Math.min(1, frame / DONE);
  const barW = 34;
  const filled = Math.round(barW * pct);
  const bar = "█".repeat(filled) + "░".repeat(barW - filled);

  return (
    <Box flexDirection="column" width={cols} paddingX={2} paddingY={1} alignItems="center">
      {/* ── logo banner ── */}
      <Box
        flexDirection="column"
        alignItems="center"
        borderStyle="round"
        borderColor={theme.line}
        paddingX={3}
        paddingY={1}
      >
        <Box>
          <Text color={theme.accent}>◤ </Text>
          <Gradient colors={LOGO_GRADIENT}>
            <Text bold>{shownLogo}</Text>
          </Gradient>
          <Text color={theme.accent}>{caret}</Text>
          {phase !== "logo" && <Text color={theme.muted}>{`  v${VERSION}`}</Text>}
        </Box>
        {phase !== "logo" && (
          <Text color={theme.fg2}>your local-first AI dev workflow hub</Text>
        )}
      </Box>

      {/* ── boot checklist ── */}
      <Box flexDirection="column" marginTop={1} width={44}>
        {BOOT.map((line, i) => {
          const done = i < bootStep;
          const active = i === bootStep;
          const color = done ? theme.ok : active ? theme.accent : theme.faint;
          return (
            <Box key={line}>
              <Box width={2} flexShrink={0}>
                {active ? (
                  <Text color={theme.accent}>
                    <Spinner type="dots" />
                  </Text>
                ) : (
                  <Text color={color}>{done ? "✔" : "○"}</Text>
                )}
              </Box>
              <Text color={done ? theme.fg2 : active ? theme.fg : theme.faint}>{line}</Text>
            </Box>
          );
        })}
      </Box>

      {/* ── quick-start card (revealed after boot) ── */}
      {phase === "quick" && (
        <Box
          flexDirection="column"
          marginTop={1}
          borderStyle="round"
          borderColor={theme.accent}
          paddingX={2}
          paddingY={0}
          width={60}
        >
          <Text>
            <Text color={theme.accent}>{"▌ "}</Text>
            <Text bold color={theme.fg2}>
              QUICK START
            </Text>
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {TABS.map((t) => (
              <Box key={t.key}>
                <Box width={4} flexShrink={0}>
                  <Text color={theme.violet} bold>
                    {t.key}
                  </Text>
                </Box>
                <Box width={15} flexShrink={0}>
                  <Text color={theme.fg}>{t.label}</Text>
                </Box>
                <Text color={theme.muted}>{t.blurb}</Text>
              </Box>
            ))}
          </Box>
          <Box marginTop={1}>
            <Text color={theme.dim}>Ctrl ←/→ or 1-4 switch pages · Shift+Tab plan · ? help</Text>
          </Box>
        </Box>
      )}

      {/* ── progress bar + hint ── */}
      <Box marginTop={1} flexDirection="column" alignItems="center">
        <Gradient colors={LOGO_GRADIENT}>
          <Text>{bar}</Text>
        </Gradient>
        <Text color={theme.dim}>
          {phase === "quick" ? "press ↵ to enter the hub" : "booting…"}
        </Text>
      </Box>
    </Box>
  );
}
