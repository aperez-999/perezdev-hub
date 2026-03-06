import pc from "picocolors";
import { getAgentSpec } from "../core/lockfile.js";
import { getAdapter } from "../adapters/registry.js";

/** Print a managed agent's spec, file locations, and instruction preview. */
export async function runShow(name: string): Promise<void> {
  const spec = await getAgentSpec(name);
  if (!spec) {
    console.error(pc.red(`No managed agent named '${name}'. Run perezdev list.`));
    process.exit(1);
  }

  const line = (k: string, v: string) => `  ${pc.dim(k.padEnd(12))} ${v}`;
  console.log();
  console.log(pc.bold(pc.cyan(`  ${spec.name}`)) + pc.dim(`  v${spec.version}`));
  console.log(line("role", spec.role));
  console.log(line("when", spec.description));
  console.log(line("targets", spec.targets.join(", ")));
  if (spec.allowedTools.length) console.log(line("tools", spec.allowedTools.join(", ")));
  if (spec.mcpDependencies.length)
    console.log(line("mcp", spec.mcpDependencies.map((m) => m.name).join(", ")));

  console.log("\n  " + pc.bold("Files"));
  for (const t of spec.targets) {
    const found = (await getAdapter(t).list()).find((i) => i.name === spec.name);
    const mark = found ? pc.green("●") : pc.red("○ missing");
    console.log(`  ${mark} ${pc.dim(t)}  ${found?.path ?? ""}`);
  }

  console.log("\n  " + pc.bold("Instructions"));
  console.log(
    spec.instructions
      .split("\n")
      .map((l) => pc.dim("  │ ") + l)
      .join("\n"),
  );
  console.log();
}
