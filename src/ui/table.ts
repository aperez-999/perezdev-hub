import { heading } from "./style.js";

/** Visible width of a string, ignoring ANSI color codes. */
const width = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").length;

/** Render rows as an aligned table under an accented header. Cells may contain color codes. */
export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, col) => Math.max(h.length, ...rows.map((r) => width(r[col] ?? ""))));
  const fmt = (cells: string[]) =>
    cells
      .map((c, col) => (col === cells.length - 1 ? c : c + " ".repeat(widths[col]! - width(c))))
      .join("  ");
  return [heading(fmt(headers)), ...rows.map(fmt)].join("\n");
}
