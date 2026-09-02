import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Read the package version once, walking up from this module to find the
 *  perezdev-hub package.json. Works in dev (tsx) and the bundled dist build. */
function readVersion(): string {
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 6; i++) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
        if (pkg?.name === "perezdev-hub" && typeof pkg.version === "string") return pkg.version;
      } catch {
        // not here — keep climbing
      }
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  } catch {
    // fall through to default
  }
  return "0.2.0";
}

export const version: string = readVersion();
