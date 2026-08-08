import type { Page } from "./tabs.js";

export type NavIntent = { page: Page } | { cycle: -1 | 1 };

export const PAGE_COUNT = 3;

/** Parse Shift+arrows and F1–F3 from raw stdin (Ink's useInput swallows them). */
export function navFromData(data: string): NavIntent | null {
  const d = data.startsWith("\x1b") ? data.slice(1) : data;
  if (d === "OP" || d === "[11~" || d === "[[A") return { page: 1 };
  if (d === "OQ" || d === "[12~" || d === "[[B") return { page: 2 };
  if (d === "OR" || d === "[13~" || d === "[[C") return { page: 3 };
  if (d === "[1;2C") return { cycle: 1 };
  if (d === "[1;2D") return { cycle: -1 };
  return null;
}

export function nextPage(page: Page, dir: -1 | 1): Page {
  return ((((page - 1 + dir + PAGE_COUNT) % PAGE_COUNT) + 1) as Page);
}

/** Empty field + lone `?` means help, not a character. */
export function isBareHelpInput(next: string, prev: string): boolean {
  return next === "?" && prev.trim() === "";
}
