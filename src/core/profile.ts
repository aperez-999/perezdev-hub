import { z } from "zod";
import { agentSpecSchema, mcpDependencySchema, type AgentSpec } from "./agent-spec.js";
import type { LockEntry, McpEntry } from "./lockfile.js";
import type { RegistryMcpServer } from "../registry/index.js";

const profileMcpSchema = z.object({
  id: z.string(),
  name: z.string(),
  dependency: mcpDependencySchema,
});

export const profileSchema = z.object({
  perezdevProfile: z.literal(1),
  name: z.string().default("profile"),
  createdAt: z.string().optional(),
  agents: z.array(agentSpecSchema).default([]),
  mcp: z.array(profileMcpSchema).default([]),
});

export type Profile = z.infer<typeof profileSchema>;
export type ProfileMcp = z.infer<typeof profileMcpSchema>;

/** Build a portable profile from the current lockfile entries. */
export function buildProfile(agents: LockEntry[], mcp: McpEntry[], name: string, createdAt: string): Profile {
  return {
    perezdevProfile: 1,
    name,
    createdAt,
    agents: agents.map((e) => e.spec),
    mcp: mcp.map((m) => ({ id: m.id, name: m.name, dependency: m.dependency })),
  };
}

/** Parse + validate a profile JSON string. Throws a readable message on bad input. */
export function parseProfile(text: string): Profile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("not valid JSON");
  }
  const result = profileSchema.safeParse(raw);
  if (!result.success) {
    if (typeof (raw as { perezdevProfile?: unknown })?.perezdevProfile === "undefined") {
      throw new Error("not a PerezDev profile (missing 'perezdevProfile' version key)");
    }
    const first = result.error.issues[0];
    throw new Error(`invalid profile: ${first ? `${first.path.join(".") || "root"} — ${first.message}` : "schema mismatch"}`);
  }
  return result.data;
}

/** Convert a profile MCP entry into an installable catalog server. */
export function profileToServer(entry: ProfileMcp): RegistryMcpServer {
  return {
    id: entry.id,
    name: entry.name,
    description: `imported from a profile`,
    command: entry.dependency.command,
    args: entry.dependency.args,
    tags: ["profile"],
    env: entry.dependency.env,
  };
}

export const agentNames = (p: Profile): string[] => p.agents.map((a: AgentSpec) => a.name);
