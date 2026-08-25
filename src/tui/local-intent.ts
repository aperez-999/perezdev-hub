import { MCP_SERVERS } from "../registry/mcp-servers.js";

export type LocalIntent =
  | { kind: "none" }
  | { kind: "auto" }
  | { kind: "mcp"; id: string }
  | { kind: "skills" };

const TOOL_TALK = /\b(claude code|cursor|copilot|codex|cline|windsurf|roo code|roo)\b/i;
const SETUP = /\b(install|setup|set up|configure|enable)\b/i;

/** Map a Chat line to a hub action so we don't dump generic clone tutorials. */
export function parseLocalIntent(text: string): LocalIntent {
  const t = text.trim();
  const low = t.toLowerCase();
  if (t.length < 80 && /\b(auto(mate)? locally|enable auto|turn on auto)\b/.test(low)) return { kind: "auto" };
  if (SETUP.test(low) && (/\bmcp\b/.test(low) || /\bserver\b/.test(low))) {
    const hit = MCP_SERVERS.find((s) => low.includes(s.id) || low.includes(s.name.toLowerCase()));
    if (hit) return { kind: "mcp", id: hit.id };
  }
  if (SETUP.test(low) && TOOL_TALK.test(low)) return { kind: "skills" };
  return { kind: "none" };
}
