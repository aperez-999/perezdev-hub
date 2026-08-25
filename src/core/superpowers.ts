import { parseAgentSpec, slugSchema, type AgentSpec, type ToolId } from "./agent-spec.js";
import { installSpecs, planSpec } from "./install.js";
import type { PlannedFile } from "../adapters/types.js";
import { slugify } from "./slug.js";

const UA =
  "Mozilla/5.0 (compatible; perezdev-hub/0.2; +https://github.com/aperez-999/perezdev-hub)";

/** Pinned obra/superpowers commit — mutable `main` is a prompt-injection supply chain. */
export const SUPERPOWERS_COMMIT = "b36e0829c6d0140e93cfef2ca599b1b07d4a7797";
const MAX_SKILL_BYTES = 200_000;

/** Known skill folders in obra/superpowers — used when the GitHub API is unavailable. */
export const SUPERPOWERS_SKILL_IDS = [
  "using-superpowers",
  "brainstorming",
  "writing-plans",
  "executing-plans",
  "test-driven-development",
  "systematic-debugging",
  "requesting-code-review",
  "receiving-code-review",
  "finishing-a-development-branch",
  "subagent-driven-development",
  "using-git-worktrees",
  "verification-before-completion",
  "writing-skills",
  "dispatching-parallel-agents",
] as const;

const RAW = (id: string): string =>
  `https://raw.githubusercontent.com/obra/superpowers/${SUPERPOWERS_COMMIT}/skills/${id}/SKILL.md`;

export interface SuperpowersSkill {
  name: string;
  description: string;
  instructions: string;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw.trim() };
  const meta: Record<string, string> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: (m[2] ?? "").trim() };
}

/** Parse a Superpowers SKILL.md (YAML frontmatter + body). */
export function parseSkillMarkdown(raw: string, fallbackName: string): SuperpowersSkill | null {
  const { meta, body } = parseFrontmatter(raw);
  if (body.length < 40) return null;
  const rawName = (meta.name || fallbackName).toLowerCase().replace(/_/g, "-");
  const name = slugSchema.safeParse(rawName).success ? rawName : slugify(fallbackName);
  let description = (meta.description || `${name} Superpowers SDLC skill`).trim();
  if (description.length < 8) description = `${name} Superpowers SDLC skill`;
  if (description.length > 400) description = description.slice(0, 397) + "...";
  return { name, description, instructions: body };
}

export async function fetchSuperpowersSkills(
  fetcher: typeof fetch = fetch,
): Promise<{ skills: SuperpowersSkill[]; error?: string }> {
  const results = await Promise.all(
    SUPERPOWERS_SKILL_IDS.map(async (id) => {
      try {
        const res = await fetcher(RAW(id), {
          signal: AbortSignal.timeout(8000),
          headers: { "user-agent": UA },
        });
        if (!res.ok) return null;
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.byteLength > MAX_SKILL_BYTES) return null;
        return parseSkillMarkdown(new TextDecoder().decode(buf), id);
      } catch {
        return null;
      }
    }),
  );
  const skills = results.filter((s): s is SuperpowersSkill => s !== null);
  if (skills.length === 0) {
    return { skills: [], error: "could not fetch Superpowers skills (network)" };
  }
  return { skills };
}

export function skillToSpec(skill: SuperpowersSkill, targets: ToolId[]): AgentSpec {
  return parseAgentSpec({
    name: skill.name,
    description: skill.description,
    role: "a Superpowers SDLC skill",
    instructions: skill.instructions,
    targets,
    source: "imported",
  });
}

export async function planSuperpowersPack(skills: SuperpowersSkill[], targets: ToolId[]): Promise<PlannedFile[]> {
  if (targets.length === 0) return [];
  const files: PlannedFile[] = [];
  for (const skill of skills) files.push(...(await planSpec(skillToSpec(skill, targets))));
  return files;
}

export async function installSuperpowersPack(skills: SuperpowersSkill[], targets: ToolId[]): Promise<PlannedFile[]> {
  if (targets.length === 0) return [];
  const now = new Date().toISOString();
  return installSpecs(
    skills.map((skill) => skillToSpec(skill, targets)),
    now,
  );
}
