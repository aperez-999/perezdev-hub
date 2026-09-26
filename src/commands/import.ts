import pc from "picocolors";
import { readIfExists } from "../util/fs-safe.js";
import { safeParseAgentSpec } from "../core/agent-spec.js";
import { planChanges } from "../core/install.js";
import { resolveScope, type ScopeOptions } from "../core/scope.js";
import { parseTargetCsv } from "../core/targets.js";
import { confirmAndApply, type ApplyOptions } from "../ui/apply.js";
import { p, intro } from "../ui/prompts.js";

export interface ImportOptions extends ScopeOptions, ApplyOptions {
  target?: string;
}

/** Install a shared agent spec from a JSON file produced by `perezdev export`. */
export async function runImport(file: string, opts: ImportOptions = {}): Promise<void> {
  const scope = await resolveScope(opts);
  intro("import", scope);

  const raw = await readIfExists(file);
  if (raw === null) {
    p.cancel(`File not found: ${file}`);
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    p.cancel(`Not valid JSON: ${file}`);
    process.exit(1);
  }
  const result = safeParseAgentSpec(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    p.cancel(`Invalid agent spec: ${issue ? `${issue.path.join(".")} — ${issue.message}` : "schema mismatch"}`);
    process.exit(1);
  }
  const targets = parseTargetCsv(opts.target);
  const spec = { ...result.data, source: "imported" as const, ...(targets ? { targets } : {}) };

  const plan = await planChanges(scope, { agents: [spec] });
  await confirmAndApply(plan, `Import '${spec.name}'?`, opts);
  if (opts.dryRun) return;
  p.outro(`${pc.green("✓")} Imported ${pc.bold(spec.name)}.`);
}
