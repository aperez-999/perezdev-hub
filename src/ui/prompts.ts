import * as p from "@clack/prompts";
import pc from "picocolors";
import { previewDiff } from "../util/fs-safe.js";
import type { PlannedFile } from "../adapters/plan.js";
import { toolName } from "../adapters/tools.js";
import { displayPath, scopeLabel, type Scope } from "../core/scope.js";

export { p };

/** Exit cleanly if the user cancels a clack prompt. */
export function guardCancel<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }
  return value as T;
}

/** Interactive only when both ends are a terminal and CI isn't set. */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && !process.env.CI);
}

/** `perezdev <cmd> · project (.)` — every command says where it's acting. */
export function intro(command: string, scope: Scope): void {
  p.intro(`${pc.bold(`perezdev ${command}`)} ${pc.dim(`· ${scopeLabel(scope)}`)}`);
}

const MAX_DIFF_LINES = 30;

/** Render a colored diff preview for the files about to be written. */
export function renderDiff(scope: Scope, files: PlannedFile[]): string {
  const out: string[] = [];
  for (const f of files) {
    const status = f.previous === null ? pc.green("create") : pc.yellow("update");
    const readers = f.tools.length > 0 ? pc.dim(`  (${f.tools.map(toolName).join(", ")})`) : "";
    out.push(`${status} ${pc.bold(displayPath(scope, f.path))}${readers}`);
    if (f.kind === "mcp") {
      // Shared configs can be large; only show the lines that change.
      const changed = previewDiff(f.previous, f.contents).filter((l) => l.type !== "context");
      for (const line of changed.slice(0, MAX_DIFF_LINES)) {
        out.push(line.type === "add" ? pc.green(`  + ${line.text}`) : pc.red(`  - ${line.text}`));
      }
      continue;
    }
    const lines = previewDiff(f.previous, f.contents);
    for (const line of lines.slice(0, MAX_DIFF_LINES)) {
      if (line.type === "add") out.push(pc.green(`  + ${line.text}`));
      else if (line.type === "remove") out.push(pc.red(`  - ${line.text}`));
      else out.push(pc.dim(`    ${line.text}`));
    }
    if (lines.length > MAX_DIFF_LINES) out.push(pc.dim(`    … ${lines.length - MAX_DIFF_LINES} more lines`));
  }
  return out.join("\n");
}
