import pc from "picocolors";
import { getAgentSpec } from "../core/lockfile.js";
import { resolveScope, type ScopeOptions } from "../core/scope.js";
import { atomicWrite } from "../util/fs-safe.js";

export interface ExportOptions extends ScopeOptions {
  out?: string;
}

/**
 * Export a managed agent's spec as JSON — to a file (`--out`) or stdout — so it
 * can be shared and re-installed elsewhere with `perezdev import`.
 */
export async function runExport(name: string, opts: ExportOptions = {}): Promise<void> {
  const scope = await resolveScope(opts);
  const spec = await getAgentSpec(scope, name);
  if (!spec) {
    console.error(pc.red(`No agent named '${name}'. Run perezdev list.`));
    process.exit(1);
  }
  const json = JSON.stringify(spec, null, 2) + "\n";

  if (opts.out) {
    await atomicWrite(opts.out, json);
    console.error(pc.green(`✓ Exported '${name}' → ${opts.out}`));
  } else {
    process.stdout.write(json);
  }
}
