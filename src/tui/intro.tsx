import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import Gradient from "ink-gradient";
import { theme, LOGO_GRADIENT } from "./theme.js";
import { version as VERSION } from "./version.js";

const LOGO = "PEREZDEV HUB";
const TAGLINE = "local-first workbench";

// Type the wordmark, then the tagline, then the continue hint. Any key skips.
const FRAME_MS = 50;
const LOGO_FRAMES = 10;
const TAGLINE_AT = 12;
const CTA_AT = 14;

/** Short skippable splash: logo, then wait for ↵. Does not pretend to scan. */
export function Intro({ onDone }: { onDone: () => void }): React.ReactElement {
  const { stdout } = useStdout();
  const cols = stdout?.columns ? Math.min(stdout.columns, 132) : 80;
  const rows = stdout?.rows ?? 0;
  const [frame, setFrame] = useState(0);
  const finished = useRef(false);

  const finish = (): void => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  };

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f >= CTA_AT ? f : f + 1));
    }, FRAME_MS);
    return () => clearInterval(id);
  }, []);

  const logoDone = frame >= LOGO_FRAMES;
  const showTagline = frame >= TAGLINE_AT;
  const showCta = frame >= CTA_AT;

  const [blink, setBlink] = useState(true);
  useEffect(() => {
    if (!showCta) return;
    const id = setInterval(() => setBlink((b) => !b), 530);
    return () => clearInterval(id);
  }, [showCta]);

  useInput(() => finish());

  const typed = Math.max(1, Math.ceil((LOGO.length * Math.min(frame + 1, LOGO_FRAMES)) / LOGO_FRAMES));
  const shownLogo = LOGO.slice(0, Math.min(typed, LOGO.length));
  const caret = !logoDone && frame % 2 === 0 ? "▋" : "";

  // Center the card on a real TTY; keep a 1-cell top pad in tests / tiny windows.
  const blockRows = 8;
  const padTop = rows > blockRows + 4 ? Math.floor((rows - blockRows) / 2) : 1;

  return (
    <Box flexDirection="column" width={cols} paddingX={2} paddingTop={padTop} alignItems="center">
      <Box
        flexDirection="column"
        alignItems="center"
        borderStyle="round"
        borderColor={logoDone ? theme.accent : theme.line}
        paddingX={2}
        paddingY={1}
      >
        <Box>
          <Text color={theme.accent}>◤ </Text>
          <Gradient colors={LOGO_GRADIENT}>
            <Text bold>{shownLogo}</Text>
          </Gradient>
          {caret ? <Text color={theme.accent}>{caret}</Text> : null}
          {logoDone && <Text color={theme.muted}>{`  v${VERSION}`}</Text>}
        </Box>
        {showTagline ? (
          <Box marginTop={1}>
            <Text color={theme.fg2}>{TAGLINE}</Text>
          </Box>
        ) : (
          <Box marginTop={1}>
            <Text> </Text>
          </Box>
        )}
      </Box>

      <Box marginTop={2} height={1}>
        {showCta ? (
          <Text color={blink ? theme.accent : theme.dim} bold>
            press ↵ to continue
          </Text>
        ) : (
          <Text> </Text>
        )}
      </Box>
    </Box>
  );
}
