import type { ToolId } from "../core/agent-spec.js";
import { ClaudeCodeAdapter } from "./claude-code.js";
import { CodexAdapter } from "./codex.js";
import { CopilotAdapter } from "./copilot.js";
import { CursorAdapter } from "./cursor.js";
import { ClineAdapter } from "./cline.js";
import { WindsurfAdapter } from "./windsurf.js";
import { RooAdapter } from "./roo.js";
import type { Adapter, Detection } from "./types.js";

/** All adapters perezdev ships. Register new tools here. */
export function allAdapters(): Adapter[] {
  return [
    new ClaudeCodeAdapter(),
    new CursorAdapter(),
    new CopilotAdapter(),
    new CodexAdapter(),
    new ClineAdapter(),
    new WindsurfAdapter(),
    new RooAdapter(),
  ];
}

/** Look up a single adapter by tool id. */
export function getAdapter(id: ToolId): Adapter {
  const found = allAdapters().find((a) => a.id === id);
  if (!found) throw new Error(`unknown tool: ${id}`);
  return found;
}

export interface DetectedTool {
  adapter: Adapter;
  detection: Detection;
}

/** Detect every supported tool on the machine. */
export async function detectAll(): Promise<DetectedTool[]> {
  return Promise.all(
    allAdapters().map(async (adapter) => ({ adapter, detection: await adapter.detect() })),
  );
}
