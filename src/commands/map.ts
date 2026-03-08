import pc from "picocolors";
import { engineRequest } from "../engine/bridge.js";

export interface MapOptions {
  depth?: string;
}

/** Print a markdown file-tree map of a directory via the Python engine. */
export async function runMap(dir = ".", opts: MapOptions = {}): Promise<void> {
  const depth = Number(opts.depth ?? 3);
  try {
    const res = await engineRequest<{ tree: string; count: number }>("filetree", { dir, depth });
    console.log();
    console.log(res.tree);
    console.log(pc.dim(`\n  ${res.count} entries · depth ${depth}\n`));
  } catch (err) {
    console.error(pc.red(`engine error: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
}
