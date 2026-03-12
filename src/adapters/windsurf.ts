import { join } from "node:path";
import { home } from "../core/config.js";
import { FlatMarkdownAdapter } from "./flat-markdown.js";

/** Windsurf (Codeium) — per-agent rule files under ~/.codeium/windsurf/rules/. */
export class WindsurfAdapter extends FlatMarkdownAdapter {
  readonly id = "windsurf" as const;
  readonly displayName = "Windsurf";
  protected root = join(home(), ".codeium", "windsurf");
  protected agentsDir = join(home(), ".codeium", "windsurf", "rules");
}
