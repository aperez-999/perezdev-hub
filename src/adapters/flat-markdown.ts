import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentSpec, ToolId } from "../core/agent-spec.js";
import { exists, readIfExists, removeIfExists } from "../util/fs-safe.js";
import type { Adapter, Detection, ManagedItem, PlannedFile } from "./types.js";
import { buildInstructionMarkdown, commitFile, isOwned, planFile, readVersion } from "./shared.js";

/**
 * Base for tools that consume a single markdown instruction file per agent in
 * one directory, with no MCP support yet (Codex, Copilot in v1). Subclasses
 * provide identity and the directories to detect/write into.
 */
export abstract class FlatMarkdownAdapter implements Adapter {
  abstract readonly id: ToolId;
  abstract readonly displayName: string;
  /** Directory whose existence signals the tool is configured. */
  protected abstract root: string;
  /** Directory where per-agent markdown files live. */
  protected abstract agentsDir: string;

  private agentFile(name: string): string {
    return join(this.agentsDir, `${name}.md`);
  }

  async detect(): Promise<Detection> {
    const found = await exists(this.root);
    return { installed: found, detail: found ? `found ${this.root}` : `no ${this.root}` };
  }

  async plan(spec: AgentSpec): Promise<PlannedFile[]> {
    return [await planFile(this.agentFile(spec.name), buildInstructionMarkdown(spec))];
  }

  async write(spec: AgentSpec): Promise<PlannedFile[]> {
    const files = await this.plan(spec);
    for (const f of files) await commitFile(f);
    return files;
  }

  async list(): Promise<ManagedItem[]> {
    if (!(await exists(this.agentsDir))) return [];
    const entries = await readdir(this.agentsDir, { withFileTypes: true });
    const items: ManagedItem[] = [];
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".md")) continue;
      const path = join(this.agentsDir, e.name);
      const content = await readIfExists(path);
      if (content && isOwned(content)) {
        items.push({
          name: e.name.replace(/\.md$/, ""),
          tool: this.id,
          path,
          version: readVersion(content),
        });
      }
    }
    return items;
  }

  async remove(spec: AgentSpec): Promise<boolean> {
    return removeIfExists(this.agentFile(spec.name));
  }
}
