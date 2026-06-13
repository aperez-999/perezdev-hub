import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentSpec } from "../core/agent-spec.js";
import { home } from "../core/config.js";
import { exists, readIfExists, removeIfExists } from "../util/fs-safe.js";
import type { Adapter, Detection, ManagedItem, PlannedFile } from "./types.js";
import {
  buildSkillMarkdown,
  commitFile,
  isOwned,
  mergeMcpJson,
  planFile,
  pruneMcpJson,
  readVersion,
} from "./shared.js";

/** Adapter for Claude Code: SKILL.md skills + mcpServers in settings.json. */
export class ClaudeCodeAdapter implements Adapter {
  readonly id = "claude-code" as const;
  readonly displayName = "Claude Code";

  private root = join(home(), ".claude");
  private skillsDir = join(home(), ".claude", "skills");
  private settings = join(home(), ".claude", "settings.json");

  private skillFile(name: string): string {
    return join(this.skillsDir, name, "SKILL.md");
  }

  async detect(): Promise<Detection> {
    const found = await exists(this.root);
    return {
      installed: found,
      detail: found ? `found ${this.root}` : `no ${this.root}`,
    };
  }

  mcpConfigPath(): string {
    return this.settings;
  }

  async plan(spec: AgentSpec): Promise<PlannedFile[]> {
    const files: PlannedFile[] = [
      await planFile(this.skillFile(spec.name), buildSkillMarkdown(spec)),
    ];
    if (spec.mcpDependencies.length > 0) {
      files.push(await planFile(this.settings, await mergeMcpJson(this.settings, spec.mcpDependencies)));
    }
    return files;
  }

  async write(spec: AgentSpec): Promise<PlannedFile[]> {
    const files = await this.plan(spec);
    for (const f of files) await commitFile(f);
    return files;
  }

  async list(): Promise<ManagedItem[]> {
    if (!(await exists(this.skillsDir))) return [];
    const entries = await readdir(this.skillsDir, { withFileTypes: true });
    const items: ManagedItem[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const path = this.skillFile(e.name);
      const content = await readIfExists(path);
      if (content && isOwned(content)) {
        items.push({ name: e.name, tool: this.id, path, version: readVersion(content) });
      }
    }
    return items;
  }

  async remove(spec: AgentSpec): Promise<boolean> {
    let removed = await removeIfExists(this.skillFile(spec.name));
    if (spec.mcpDependencies.length > 0) {
      const pruned = await pruneMcpJson(this.settings, spec.mcpDependencies);
      if (pruned !== null) {
        await commitFile({ path: this.settings, contents: pruned, previous: null });
        removed = true;
      }
    }
    return removed;
  }
}
