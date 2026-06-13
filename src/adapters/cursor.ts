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

/** Adapter for Cursor: `.mdc` rules in ~/.cursor/rules + mcp.json. */
export class CursorAdapter implements Adapter {
  readonly id = "cursor" as const;
  readonly displayName = "Cursor";

  private root = join(home(), ".cursor");
  private rulesDir = join(home(), ".cursor", "rules");
  private mcp = join(home(), ".cursor", "mcp.json");

  private ruleFile(name: string): string {
    return join(this.rulesDir, `${name}.mdc`);
  }

  async detect(): Promise<Detection> {
    const found = await exists(this.root);
    return { installed: found, detail: found ? `found ${this.root}` : `no ${this.root}` };
  }

  mcpConfigPath(): string {
    return this.mcp;
  }

  async plan(spec: AgentSpec): Promise<PlannedFile[]> {
    const files: PlannedFile[] = [
      await planFile(this.ruleFile(spec.name), buildSkillMarkdown(spec)),
    ];
    if (spec.mcpDependencies.length > 0) {
      files.push(await planFile(this.mcp, await mergeMcpJson(this.mcp, spec.mcpDependencies)));
    }
    return files;
  }

  async write(spec: AgentSpec): Promise<PlannedFile[]> {
    const files = await this.plan(spec);
    for (const f of files) await commitFile(f);
    return files;
  }

  async list(): Promise<ManagedItem[]> {
    if (!(await exists(this.rulesDir))) return [];
    const entries = await readdir(this.rulesDir, { withFileTypes: true });
    const items: ManagedItem[] = [];
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".mdc")) continue;
      const path = join(this.rulesDir, e.name);
      const content = await readIfExists(path);
      if (content && isOwned(content)) {
        items.push({
          name: e.name.replace(/\.mdc$/, ""),
          tool: this.id,
          path,
          version: readVersion(content),
        });
      }
    }
    return items;
  }

  async remove(spec: AgentSpec): Promise<boolean> {
    let removed = await removeIfExists(this.ruleFile(spec.name));
    if (spec.mcpDependencies.length > 0) {
      const pruned = await pruneMcpJson(this.mcp, spec.mcpDependencies);
      if (pruned !== null) {
        await commitFile({ path: this.mcp, contents: pruned, previous: null });
        removed = true;
      }
    }
    return removed;
  }
}
