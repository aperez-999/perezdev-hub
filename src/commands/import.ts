import pc from "picocolors";
import { readIfExists } from "../util/fs-safe.js";
import { safeParseAgentSpec } from "../core/agent-spec.js";
import { installSpec, planSpec } from "../core/install.js";
import { p, guardCancel, renderDiff } from "../ui/prompts.js";

export interface ImportOptions {
  yes?: boolean;
  dryRun?: boolean;
}

const isTty = Boolean(process.stdout.isTTY);

/** Install a shared agent spec from a JSON file produced by `perezdev export`. */
export async function runImport(file: string, opts: ImportOptions = {}): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" perezdev import ")));

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
    p.cancel(`Invalid agent spec: ${result.error.issues[0]?.message}`);
    process.exit(1);
  }
  const spec = result.data;

  if (opts.dryRun) {
    p.note(renderDiff(await planSpec(spec)), "Files to write");
    p.outro(pc.dim(`dry run — nothing written. Drop --dry-run to import '${spec.name}'.`));
    return;
  }

  const auto = opts.yes === true || !isTty;
  if (!auto) {
    p.note(renderDiff(await planSpec(spec)), "Files to write");
    const ok = guardCancel(
      await p.confirm({ message: `Import '${spec.name}' → ${spec.targets.join(", ")}?` }),
    );
    if (!ok) {
      p.cancel("Aborted.");
      process.exit(0);
    }
  }

  await installSpec(spec, new Date().toISOString());
  p.outro(`${pc.green("✓")} Imported ${pc.bold(spec.name)} → ${spec.targets.join(", ")}.`);
}
