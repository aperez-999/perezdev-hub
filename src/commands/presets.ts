import pc from "picocolors";
import { PRESETS } from "../core/presets.js";

/** List curated presets installable via `perezdev create --preset <id>`. */
export async function runPresets(): Promise<void> {
  console.log(pc.bold("\n  Presets") + pc.dim("  (perezdev create --preset <id>)\n"));
  const width = Math.max(...PRESETS.map((p) => p.id.length));
  for (const preset of PRESETS) {
    console.log(`  ${pc.cyan(preset.id.padEnd(width))}  ${pc.dim(preset.summary)}`);
  }
  console.log();
}
