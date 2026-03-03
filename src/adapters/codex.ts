import { join } from "node:path";
import { home } from "../core/config.js";
import { FlatMarkdownAdapter } from "./flat-markdown.js";

/**
 * Adapter for OpenAI Codex CLI. Writes custom prompts to ~/.codex/prompts.
 * MCP servers (config.toml) are not managed in v1.
 */
export class CodexAdapter extends FlatMarkdownAdapter {
  readonly id = "codex" as const;
  readonly displayName = "Codex";
  protected root = join(home(), ".codex");
  protected agentsDir = join(home(), ".codex", "prompts");
}
