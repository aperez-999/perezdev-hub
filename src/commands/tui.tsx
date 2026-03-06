import React from "react";
import { render } from "ink";
import pc from "picocolors";
import { App } from "../tui/app.js";

/** Launch the animated fullscreen TUI. Requires an interactive terminal. */
export async function runTui(): Promise<void> {
  if (!process.stdout.isTTY) {
    console.error(pc.red("The TUI needs an interactive terminal. Try `perezdev list` or `perezdev menu`."));
    process.exit(1);
  }
  const { waitUntilExit } = render(<App />);
  await waitUntilExit();
}
