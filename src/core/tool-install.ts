import { CLI_AGENTS } from "../registry/agents.js";
import type { ToolId } from "./agent-spec.js";

/** Official install strings shown when a write-target is selected but the app is missing. Never executed. */
const FALLBACK: Record<ToolId, string> = {
  "claude-code": "npm install -g @anthropic-ai/claude-code",
  cursor: "Install Cursor from https://cursor.com",
  copilot: "Install the GitHub Copilot extension in VS Code — https://github.com/features/copilot",
  codex: "npm install -g @openai/codex",
  cline: "Install the Cline extension in VS Code or Cursor",
  windsurf: "Install Windsurf from https://windsurf.com",
  roo: "Install the Roo Code extension in VS Code",
};

/** Copy-paste install command for a hub write-target. Does not run anything. */
export function toolInstallCommand(id: ToolId): string {
  const fromReg = CLI_AGENTS.find((a) => a.id === id);
  return fromReg?.install ?? FALLBACK[id];
}
