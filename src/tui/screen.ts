/** Alternate-screen helpers so the intro cannot linger in terminal scrollback. */

const ALT_ENTER = "\x1b[?1049h";
const ALT_LEAVE = "\x1b[?1049l";
const CLEAR = "\x1b[2J\x1b[H";

export function shouldUseAltScreen(): boolean {
  return (
    process.stdout.isTTY === true &&
    !process.env.VITEST &&
    process.env.NODE_ENV !== "test" &&
    process.env.PDH_NO_ALT !== "1"
  );
}

export function enterHubScreen(stream: NodeJS.WriteStream = process.stdout): void {
  if (!shouldUseAltScreen()) return;
  stream.write(ALT_ENTER + CLEAR);
}

export function leaveHubScreen(stream: NodeJS.WriteStream = process.stdout): void {
  if (!shouldUseAltScreen()) return;
  stream.write(ALT_LEAVE);
}
