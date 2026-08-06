import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import Gradient from "ink-gradient";
import { theme, LOGO_GRADIENT } from "./theme.js";
import { version as VERSION } from "./version.js";

const LOGO = "PEREZDEV HUB";

// Logo typewriter only — no fake boot checklist. Any key skips immediately.
const FRAME_MS = 80;
const LOGO_END = 9;

/** Short skippable splash: logo, then wait for ↵. Does not pretend to scan. */
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
    const id = setInterval(() => {
      setFrame((f) => (f >= LOGO_END ? f : f + 1));
    }, FRAME_MS);
    return () => clearInterval(id);
  }, []);

  const booted = frame >= LOGO_END;

  const [blink, setBlink] = useState(true);
  useEffect(() => {
    if (!booted) return;
    const id = setInterval(() => setBlink((b) => !b), 500);
    return () => clearInterval(id);
  }, [booted]);

  useInput(() => finish());

  const typed = Math.max(1, Math.ceil((LOGO.length * (frame + 1)) / LOGO_END));
  const shownLogo = LOGO.slice(0, Math.min(typed, LOGO.length));
  const caret = !booted && frame % 2 === 0 ? "▋" : " ";

  return (
    <Box flexDirection="column" width={cols} paddingX={2} paddingY={1} alignItems="center">
      <Box
        flexDirection="column"
        alignItems="center"
        borderStyle="round"
        borderColor={booted ? theme.accent : theme.line}
        paddingX={3}
        paddingY={1}
      >
        <Box>
          <Text color={theme.accent}>◤ </Text>
          <Gradient colors={LOGO_GRADIENT}>
            <Text bold>{shownLogo}</Text>
          </Gradient>
          <Text color={theme.accent}>{caret}</Text>
          {booted && <Text color={theme.muted}>{`  v${VERSION}`}</Text>}
        </Box>
        {booted && <Text color={theme.fg2}>your local-first AI workbench</Text>}
      </Box>

      <Box marginTop={2} flexDirection="column" alignItems="center">
        {booted ? (
          <Text color={blink ? theme.accent : theme.dim} bold>
            press ↵ to enter the hub
          </Text>
        ) : (
          <Text color={theme.dim}> </Text>
        )}
      </Box>
    </Box>
  );
}
