import { join } from "node:path";
import { home } from "../core/config.js";
import { FlatMarkdownAdapter } from "./flat-markdown.js";

/** Roo Code — per-agent rule files under ~/.roo/rules/. */
export class RooAdapter extends FlatMarkdownAdapter {
  readonly id = "roo" as const;
  readonly displayName = "Roo Code";
  protected root = join(home(), ".roo");
  protected agentsDir = join(home(), ".roo", "rules");
}
