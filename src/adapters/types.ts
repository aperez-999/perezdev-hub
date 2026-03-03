import type { AgentSpec, ToolId } from "../core/agent-spec.js";

/** A file inspo intends to write, for diff preview before committing. */
export interface PlannedFile {
  path: string;
  /** New full contents to write. */
  contents: string;
  /** Existing contents (null if file does not exist yet). */
  previous: string | null;
}

/** Result of detecting whether a tool is installed/configured on the machine. */
export interface Detection {
  installed: boolean;
  /** Human note about where/how it was detected, for `inspo doctor`. */
  detail: string;
}

/** A managed item discovered in a tool's config. */
export interface ManagedItem {
  name: string;
  tool: ToolId;
  /** Absolute path of the primary file backing this item. */
  path: string;
  version?: string;
}

/**
 * An adapter translates the canonical AgentSpec into one tool's native format
 * and manages the lifecycle of items inspo created for that tool.
 *
 * To support a new AI tool, implement this interface in one new file and
 * register it in registry.ts. That is the extensibility hinge of inspo.
 */
export interface Adapter {
  readonly id: ToolId;
  readonly displayName: string;

  /** Detect whether the tool is present/configured for the current user. */
  detect(): Promise<Detection>;

  /**
   * Path to this tool's MCP-servers JSON config, if it supports MCP. Tools
   * without MCP support (Codex, Copilot in v1) omit this, and standalone MCP
   * installs skip them.
   */
  mcpConfigPath?(): string;

  /**
   * Compute the files that installing `spec` would write, WITHOUT writing them.
   * Used to render a diff preview. `write` performs the same plan + commits it.
   */
  plan(spec: AgentSpec): Promise<PlannedFile[]>;

  /** Install `spec` (backs up, writes atomically). Returns files written. */
  write(spec: AgentSpec): Promise<PlannedFile[]>;

  /** List items inspo manages for this tool. */
  list(): Promise<ManagedItem[]>;

  /**
   * Remove the item described by `spec` (deletes its file, prunes its MCP
   * entries, restores backups). The full spec is passed — sourced from the
   * lockfile — so MCP dependencies can be cleaned up too. Returns true if
   * anything was removed.
   */
  remove(spec: AgentSpec): Promise<boolean>;
}
