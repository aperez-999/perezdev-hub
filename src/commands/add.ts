import pc from "picocolors";
import type { AgentSpec } from "../core/agent-spec.js";
import { planChanges } from "../core/install.js";
import { listEntries } from "../core/lockfile.js";
import { resolveScope, scopeLabel, type Scope, type ScopeOptions } from "../core/scope.js";
import {
  describeSource,
  fetchSource,
  findSkills,
  originOf,
  parseSource,
  skillToSpec,
  sourceOfOrigin,
  type FoundSkill,
  type SkillSource,
  type SourceTree,
} from "../core/sources.js";
import { resolveTargets } from "../core/targets.js";
import { printNextSteps } from "../ui/next-steps.js";
import { confirmAndApply, type ApplyOptions } from "../ui/apply.js";
import { p, guardCancel, intro, isInteractive } from "../ui/prompts.js";
import { table } from "../ui/table.js";

export interface AddOptions extends ScopeOptions, ApplyOptions {
  target?: string;
  /** Comma-separated skill names to take from a multi-skill source. */
  skill?: string;
  /** Only list the skills a source contains. */
  list?: boolean;
}

async function load(src: SkillSource) {
  const spin = isInteractive() ? p.spinner() : null;
  spin?.start(`Fetching ${describeSource(src)}`);
  try {
    const tree = await fetchSource(src);
    spin?.stop(`Fetched ${describeSource(src)}${tree.commit ? pc.dim(` @ ${tree.commit.slice(0, 7)}`) : ""}`);
    return tree;
  } catch (err) {
    spin?.stop("Fetch failed");
    throw err;
  }
}

/** Install skills (SKILL.md folders) from GitHub or a local folder, verbatim, for every target tool. */
export async function runAdd(ref: string, opts: AddOptions = {}): Promise<void> {
  const scope = await resolveScope(opts);
  const src = await parseSource(ref);
  if (opts.list) return listSkills(src);

  intro("add", scope);
  const tree = await load(src);
  const { skills, problems } = findSkills(tree);
  for (const pr of problems) p.log.warn(`skipped ${pr.dir || "."}: ${pr.reason}`);
  if (skills.length === 0) {
    p.cancel(`No usable SKILL.md found in ${describeSource(src)}.`);
    process.exit(1);
  }

  const chosen = await choose(skills, opts);
  for (const s of chosen.filter((s) => s.description.length > 1024)) {
    p.log.warn(`${s.name}: description is over 1024 characters — Copilot and other strict loaders may skip it`);
  }
  const { targets } = await resolveTargets(scope, opts.target);
  const specs = chosen.map((s) => skillToSpec(s, originOf(src, s, tree, scope.root), targets));
  const plan = await installSkills(scope, specs, tree, opts, `Add ${chosen.map((s) => s.name).join(", ")}?`);
  if (opts.dryRun) return;
  await printNextSteps(scope, plan.next);
  p.outro(`${pc.green("✓")} Added ${chosen.map((s) => pc.bold(s.name)).join(", ")}. ${pc.dim("perezdev upgrade to pull updates later")}`);
}

async function choose(skills: FoundSkill[], opts: AddOptions): Promise<FoundSkill[]> {
  if (opts.skill) {
    const wanted = opts.skill.split(",").map((s) => s.trim()).filter(Boolean);
    const missing = wanted.filter((w) => !skills.some((s) => s.name === w));
    if (missing.length > 0) throw new Error(`not in this source: ${missing.join(", ")} — available: ${skills.map((s) => s.name).join(", ")}`);
    return skills.filter((s) => wanted.includes(s.name));
  }
  if (skills.length === 1 || opts.yes) return skills;
  if (!isInteractive()) {
    throw new Error(`this source has ${skills.length} skills — pick with --skill <names>, take all with -y, or see them with --list`);
  }
  return guardCancel(
    await p.multiselect({
      message: "Which skills?",
      options: skills.map((s) => ({ value: s, label: s.name, hint: truncate(s.description, 70) })),
      required: true,
    }),
  ) as FoundSkill[];
}

async function installSkills(scope: Scope, specs: AgentSpec[], tree: SourceTree, opts: AddOptions, question: string) {
  if (tree.skipped.length > 0) {
    p.log.warn(`Not copied (binary or over 256 KB): ${tree.skipped.slice(0, 5).join(", ")}${tree.skipped.length > 5 ? ` and ${tree.skipped.length - 5} more` : ""}`);
  }
  p.log.info(pc.dim("Skills are instructions your agents will follow — read the plan before you accept it."));
  const plan = await planChanges(scope, { agents: specs });
  await confirmAndApply(plan, question, opts);
  return plan;
}

async function listSkills(src: SkillSource): Promise<void> {
  const tree = await fetchSource(src);
  const { skills, problems } = findSkills(tree);
  console.log(pc.dim(`\n  ${describeSource(src)}${tree.commit ? ` @ ${tree.commit.slice(0, 7)}` : ""}\n`));
  if (skills.length > 0) {
    const rows = skills.map((s) => [pc.cyan(s.name), truncate(s.description, 80)]);
    console.log(table(["SKILL", "DESCRIPTION"], rows).split("\n").map((l) => `  ${l}`).join("\n"));
  }
  for (const pr of problems) console.log(pc.dim(`  skipped ${pr.dir || "."}: ${pr.reason}`));
  console.log(pc.dim(`\n  perezdev add ${describeSource(src)} --skill <name>\n`));
}

const truncate = (s: string, n: number) => {
  const one = s.replace(/\s+/g, " ");
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

export interface UpgradeOptions extends ScopeOptions, ApplyOptions {}

/** Re-fetch skills added from GitHub or a folder and apply whatever changed upstream. */
export async function runUpgrade(name: string | undefined, opts: UpgradeOptions = {}): Promise<void> {
  const scope = await resolveScope(opts);
  intro("upgrade", scope);
  const added = (await listEntries(scope)).map((e) => e.spec).filter((s) => s.origin && (!name || s.name === name));
  if (added.length === 0) {
    p.outro(name ? `'${name}' wasn't added from a source.` : `No skills added from a source in ${scopeLabel(scope)}.`);
    return;
  }

  const next: AgentSpec[] = [];
  for (const spec of added) {
    const origin = spec.origin!;
    const src = sourceOfOrigin(origin, scope.root);
    const tree = await load(src);
    const found = findSkills(tree).skills.find((s) => s.dir === "" || s.name === spec.name);
    if (!found) {
      p.log.warn(`${spec.name}: no longer found at ${describeSource(src)}`);
      continue;
    }
    next.push({ ...skillToSpec(found, originOf(src, { ...found, dir: "" }, tree, scope.root), spec.targets), mcpDependencies: spec.mcpDependencies });
  }
  const plan = await planChanges(scope, { agents: next });
  const changed = await confirmAndApply(plan, `Apply upstream changes?`, opts);
  if (opts.dryRun) return;
  p.outro(changed ? `${pc.green("✓")} Upgraded.` : `${pc.green("✓")} Already up to date.`);
}
