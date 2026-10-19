import pc from "picocolors";
import { mark } from "../ui/style.js";
import { diagnose, repair, doctorSubject, summarize, doctorExitCode, doctorAdvice, type DoctorItem } from "../core/doctor.js";
import { displayPath, resolveScope, scopeLabel, type ScopeOptions } from "../core/scope.js";
import { toolName } from "../adapters/tools.js";

export interface DoctorOptions extends ScopeOptions {
  /** Rewrite anything missing or modified from the lockfile. */
  fix?: boolean;
  /** Emit machine-readable JSON instead of the report. */
  json?: boolean;
  /** Also fail when a target tool isn't installed on this machine. */
  strict?: boolean;
}

const MARK: Record<DoctorItem["status"], string> = {
  ok: pc.green("ok"),
  missing: pc.red("missing"),
  modified: pc.yellow("modified"),
  "tool-absent": pc.dim("not installed"),
};

/**
 * Check every lockfile entry against the files on disk. Exits 1 on drift, so
 * `perezdev doctor` works as a CI gate for committed agent config.
 */
export async function runDoctor(opts: DoctorOptions = {}): Promise<void> {
  const scope = await resolveScope(opts);
  const items = await diagnose(scope);
  const repaired = opts.fix ? await repair(scope, items) : 0;
  const final = repaired > 0 ? await diagnose(scope) : items;
  const report = summarize(final, repaired);
  process.exitCode = doctorExitCode(report, opts.strict);

  if (opts.json) {
    console.log(JSON.stringify({ scope: scope.kind, root: scope.root, ...report }, null, 2));
    return;
  }

  console.log(`\n  ${mark("doctor")} ${pc.dim(`· ${scopeLabel(scope)}`)}\n`);
  if (repaired > 0) console.log(`  ${pc.green("✓")} repaired ${repaired} item(s)`);
  const problems = final.filter((i) => i.status !== "ok");
  for (const i of problems) {
    const where = i.path && i.kind !== "context" ? pc.dim(`  ${displayPath(scope, i.path)}`) : "";
    console.log(`  ${MARK[i.status]}  ${doctorSubject(i, toolName)}${where}`);
  }
  const verdict = report.ok ? pc.green("✓") : pc.red("✗");
  console.log(`\n  ${verdict} ${doctorAdvice(final)}\n`);
}
