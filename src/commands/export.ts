import pc from "picocolors";
import { getAgentSpec } from "../core/lockfile.js";
import { atomicWrite } from "../util/fs-safe.js";

export interface ExportOptions {
  out?: string;
}

/**
 * Export a managed agent's spec as JSON — to a file (`--out`) or stdout — so it
 * can be shared and re-installed elsewhere with `inspo import`.
 */
export async function runExport(name: string, opts: ExportOptions = {}): Promise<void> {
  const spec = await getAgentSpec(name);
  if (!spec) {
    console.error(pc.red(`No managed agent named '${name}'. Run inspo list.`));
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
