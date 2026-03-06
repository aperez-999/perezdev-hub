import pc from "picocolors";
import type { ManagedItem } from "../adapters/types.js";

/** Render managed items as an aligned, colorized table. */
export function renderManagedTable(items: ManagedItem[]): string {
  if (items.length === 0) return pc.dim("No managed agents found.");

  const headers = ["NAME", "TOOL", "VERSION", "PATH"];
  const rows = items.map((i) => [i.name, i.tool, i.version ?? "-", i.path]);

  const widths = headers.map((h, col) =>
    Math.max(h.length, ...rows.map((r) => r[col]!.length)),
  );

  const fmt = (cells: string[], dim = false) =>
    cells
      .map((c, col) => {
        const padded = c.padEnd(widths[col]!);
        return dim ? pc.dim(padded) : padded;
      })
      .join("  ");

  const out: string[] = [pc.bold(fmt(headers))];
  for (const r of rows) out.push(fmt(r));
  return out.join("\n");
}
