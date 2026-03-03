import { join } from "node:path";
import { home } from "../core/config.js";
import { FlatMarkdownAdapter } from "./flat-markdown.js";

/**
 * Adapter for GitHub Copilot. Writes reusable prompt files to
 * ~/.config/github-copilot/prompts. (Repo-level .github/copilot-instructions.md
 * is a future per-project target.) MCP is not managed in v1.
 */
export class CopilotAdapter extends FlatMarkdownAdapter {
  readonly id = "copilot" as const;
  readonly displayName = "GitHub Copilot";
  protected root = join(home(), ".config", "github-copilot");
  protected agentsDir = join(home(), ".config", "github-copilot", "prompts");
}
