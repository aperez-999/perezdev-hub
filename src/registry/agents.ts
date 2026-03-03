/** A catalog CLI coding agent — informational; shown with an install command. */
export interface RegistryAgent {
  id: string;
  name: string;
  description: string;
  repo: string;
  /** Copy-paste install command shown to the user (not auto-run). */
  install: string;
  tags: string[];
}

/**
 * Curated directory of terminal-native AI coding agents (inspiration:
 * awesome-cli-coding-agents). Informational only — the hub shows the install
 * command and link; it does not install these for you.
 */
export const CLI_AGENTS: RegistryAgent[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Anthropic's official terminal coding agent with skills, MCP, and subagents.",
    repo: "https://github.com/anthropics/claude-code",
    install: "npm install -g @anthropic-ai/claude-code",
    tags: ["agent", "anthropic", "mcp", "skills"],
  },
  {
    id: "opendev",
    name: "OpenDev",
    description: "Rust terminal agent that runs a multi-model fleet (normal/thinking/critique/…) in parallel.",
    repo: "https://github.com/opendev-to/opendev",
    install: "see repo releases (single binary)",
    tags: ["agent", "rust", "multi-model", "fleet", "open-source"],
  },
  {
    id: "aider",
    name: "Aider",
    description: "AI pair programmer in your terminal, git-native with auto-commits.",
    repo: "https://github.com/Aider-AI/aider",
    install: "python -m pip install aider-install && aider-install",
    tags: ["agent", "python", "git", "open-source"],
  },
  {
    id: "codex",
    name: "OpenAI Codex CLI",
    description: "OpenAI's terminal coding agent.",
    repo: "https://github.com/openai/codex",
    install: "npm install -g @openai/codex",
    tags: ["agent", "openai"],
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    description: "Google's open-source terminal AI agent with MCP support.",
    repo: "https://github.com/google-gemini/gemini-cli",
    install: "npm install -g @google/gemini-cli",
    tags: ["agent", "google", "mcp", "open-source"],
  },
  {
    id: "goose",
    name: "Goose",
    description: "Block's extensible, open-source on-machine AI agent.",
    repo: "https://github.com/block/goose",
    install: "see repo (curl installer)",
    tags: ["agent", "extensible", "open-source"],
  },
  {
    id: "opencode",
    name: "OpenCode",
    description: "Provider-agnostic terminal coding agent with a TUI.",
    repo: "https://github.com/sst/opencode",
    install: "npm install -g opencode-ai",
    tags: ["agent", "tui", "multi-model", "open-source"],
  },
];
