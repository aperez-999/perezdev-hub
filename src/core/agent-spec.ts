import { z } from "zod";

/**
 * The canonical, tool-agnostic representation of an agent/skill.
 *
 * Every adapter serializes FROM this single source of truth into a specific
 * tool's native format (Claude Code SKILL.md, Cursor rules, etc.). Generation
 * (template or LLM) produces an AgentSpec; managing reads/writes them.
 */

export const TOOL_IDS = ["claude-code", "cursor", "copilot", "codex", "cline", "windsurf", "roo"] as const;
export type ToolId = (typeof TOOL_IDS)[number];

/** A slug: lowercase letters, numbers, hyphens. Used as filename + key. */
export const slugSchema = z
  .string()
  .min(2, "name must be at least 2 characters")
  .max(64, "name must be at most 64 characters")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "name must be kebab-case (lowercase letters, numbers, hyphens)",
  );

export const mcpDependencySchema = z.object({
  /** Logical name of the MCP server, e.g. "filesystem". */
  name: slugSchema,
  /** Command to launch a stdio server, e.g. "npx". */
  command: z.string().min(1),
  /** Arguments passed to the command. */
  args: z.array(z.string()).default([]),
  /** Optional environment variables for the server process. */
  env: z.record(z.string()).default({}),
});
export type McpDependency = z.infer<typeof mcpDependencySchema>;

/**
 * A path inside a skill folder (`scripts/fill.py`, `reference/forms.md`):
 * relative, no `..`, no hidden segments, never the SKILL.md itself.
 */
export const resourcePathSchema = z
  .string()
  .regex(/^(?!SKILL\.md$)[A-Za-z0-9_-][\w.-]*(?:\/[A-Za-z0-9_-][\w.-]*)*$/, "invalid resource path")
  .refine((p) => !p.split("/").includes(".."), "invalid resource path");

/** Where a skill added with `perezdev add` came from, so `perezdev upgrade` can re-fetch it. */
export const originSchema = z.object({
  /** `github:owner/repo` or `file:<path relative to the scope root>`. */
  source: z.string().regex(/^(github:[\w.-]+\/[\w.-]+|file:.+)$/, "invalid origin source"),
  /** Folder of the skill inside the source ("" for the root). */
  path: z.string().default(""),
  /** Branch, tag, or commit requested (GitHub only). */
  ref: z.string().optional(),
  /** Commit the content was taken from (GitHub only). */
  commit: z.string().optional(),
});
export type Origin = z.infer<typeof originSchema>;

export const agentSpecSchema = z.object({
  /** Kebab-case identifier; the filename and lookup key. */
  name: slugSchema,
  /** "When to use" description. Skill loaders decide relevance from it. */
  description: z.string().min(8).max(1536),
  /** Short statement of the agent's role/purpose. */
  role: z.string().min(4).max(200),
  /** The full instruction body (markdown). */
  instructions: z.string().min(1),
  /** Tools the agent is allowed to use. Empty = no restriction. */
  allowedTools: z.array(z.string()).default([]),
  /** MCP servers this agent depends on. */
  mcpDependencies: z.array(mcpDependencySchema).default([]),
  /** Tools this spec should be installed into. */
  targets: z.array(z.enum(TOOL_IDS)).min(1),
  /** Semver-ish version string. */
  version: z.string().default("0.1.0"),
  /** How this spec was produced. */
  source: z.enum(["generated", "imported"]).default("generated"),
  /** Set for skills added from GitHub or a folder; their SKILL.md is reproduced verbatim. */
  origin: originSchema.optional(),
  /** The original SKILL.md frontmatter (YAML, without the `---` fences), for verbatim skills. */
  frontmatter: z.string().optional(),
  /** Extra text files shipped in the skill folder, by relative path. */
  resources: z.record(resourcePathSchema, z.string()).default({}),
});

export type AgentSpec = z.infer<typeof agentSpecSchema>;

/** Parse + validate an unknown value into an AgentSpec (throws on failure). */
export function parseAgentSpec(input: unknown): AgentSpec {
  return agentSpecSchema.parse(input);
}

/** Safe parse variant returning the zod result. */
export function safeParseAgentSpec(input: unknown) {
  return agentSpecSchema.safeParse(input);
}
