import * as p from "@clack/prompts";
import pc from "picocolors";
import { previewDiff } from "../util/fs-safe.js";
import type { PlannedFile } from "../adapters/types.js";

export { p };

/** One-line keybinding legend for clack prompts (arrows/space/enter/esc). */
export const KEYHINTS = pc.dim("↑↓ move · space select · enter submit · esc cancel");

/** Print the keybinding legend as a narrator line. */
export function showKeyHints(): void {
  p.log.message(KEYHINTS);
}

/** Exit cleanly if the user cancels a clack prompt. */
export function guardCancel<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }
  return value as T;
}

/** Render a colored diff preview for the files about to be written. */
export function renderDiff(files: PlannedFile[]): string {
  const out: string[] = [];
  for (const f of files) {
    const status = f.previous === null ? pc.green("create") : pc.yellow("update");
    out.push(`${status} ${pc.bold(f.path)}`);
    const lines = previewDiff(f.previous, f.contents);
    for (const line of lines.slice(0, 40)) {
      if (line.type === "add") out.push(pc.green(`  + ${line.text}`));
      else if (line.type === "remove") out.push(pc.red(`  - ${line.text}`));
      else out.push(pc.dim(`    ${line.text}`));
    }
    if (lines.length > 40) out.push(pc.dim(`    … ${lines.length - 40} more lines`));
    out.push("");
  }
  return out.join("\n");
}
