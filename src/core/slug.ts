/** Stopwords dropped before taking slug tokens (shared by TUI generate and CLI create). */
const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "who",
  "that",
  "this",
  "these",
  "those",
  "for",
  "to",
  "of",
  "in",
  "on",
  "with",
  "as",
  "at",
  "by",
  "from",
  "is",
  "are",
  "be",
  "it",
  "i",
  "we",
  "you",
  "my",
  "your",
  "our",
]);

/**
 * Kebab slug from a free-text goal. Drops stopwords, then takes three tokens
 * (first two + last when there are four or more) so
 * "backend developer who fixes bugs" → `backend-developer-bugs`.
 */
export function slugify(s: string): string {
  const tokens = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOP.has(t));
  const picked =
    tokens.length >= 4 ? [tokens[0], tokens[1], tokens[tokens.length - 1]] : tokens.slice(0, 3);
  return picked.filter(Boolean).join("-").slice(0, 40) || "agent";
}
