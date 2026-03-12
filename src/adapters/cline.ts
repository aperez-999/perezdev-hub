import { join } from "node:path";
import { home } from "../core/config.js";
import { FlatMarkdownAdapter } from "./flat-markdown.js";

/** Cline — per-agent rule files under ~/.clinerules/ (directory form). */
export class ClineAdapter extends FlatMarkdownAdapter {
  readonly id = "cline" as const;
  readonly displayName = "Cline";
  protected root = join(home(), ".clinerules");
  protected agentsDir = join(home(), ".clinerules");
}
