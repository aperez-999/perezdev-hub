/** Canonical TUI copy — one home so chat, confirm, and help cannot drift. */

export const EMPTY_CHAT = "Ask anything about this repo.";
export const EMPTY_CHAT_HINT = "Shift+← / →  pages ·  Ctrl+A  local auto ·  ?  keys";

/** First-run (and returning) empty-state line once write-targets exist. */
export function chatHint(targets?: string[]): string {
  if (targets && targets.length > 0) return `Writing to ${targets.join(" · ")} · Shift+→ Skills`;
  return EMPTY_CHAT_HINT;
}
export const PROMPT_PLACEHOLDER = "ask or /command";
export const CONFIRM_TITLE = "Write these files?";
export const OFFLINE_HINT =
  "No model. Run ollama pull llama3 or set ANTHROPIC_API_KEY / OPENAI_API_KEY.";
export const SKILLS_GOAL = "Describe the agent";
export const SKILLS_TOOLS = "Install into";
export const SKILLS_PREVIEW_EMPTY = "Type a goal, then Generate.";
export const MCP_DISCOVER = "Discover from repo";
export const MCP_CUSTOM_PLACEHOLDER = "custom server…";
