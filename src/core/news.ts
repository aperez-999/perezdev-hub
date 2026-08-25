export interface NewsItem {
  title: string;
  source: string;
  url: string;
  published: string;
}

export interface NewsResult {
  items: NewsItem[];
  /** False when the pane is showing the bundled digest because live HN missed. */
  live: boolean;
}

const TOPICS = ["Claude Code", "Ollama", "MCP", "Cursor"] as const;

const UA =
  "Mozilla/5.0 (compatible; perezdev-hub/0.2; +https://github.com/aperez-999/perezdev-hub)";

const MAX_ITEMS = 12;
const CACHE_MS = 30 * 60 * 1000;

/** Title/url must mention the topic — Algolia otherwise ranks unrelated stories. */
const RELEVANT =
  /\b(mcp|model context|claude|ollama|cursor|codex|anthropic|agent skill|llm)\b/i;

function algoliaUrl(query: string): string {
  return (
    "https://hn.algolia.com/api/v1/search_by_date?query=" +
    encodeURIComponent(query) +
    "&tags=story&hitsPerPage=8"
  );
}

let cache: { at: number; result: NewsResult } | null = null;

/** Evergreen lines shown when live HN is down. Labeled `digest` so they are not fake headlines. */
export const NEWS_DIGEST: NewsItem[] = [
  {
    title: "Model Context Protocol — connect tools to coding agents",
    source: "digest",
    url: "https://modelcontextprotocol.io",
    published: "",
  },
  {
    title: "Claude Code — terminal agent with skills and MCP",
    source: "digest",
    url: "https://docs.anthropic.com/en/docs/claude-code",
    published: "",
  },
  {
    title: "Ollama — run open models on your machine",
    source: "digest",
    url: "https://ollama.com",
    published: "",
  },
  {
    title: "Cursor — the AI code editor",
    source: "digest",
    url: "https://cursor.com",
    published: "",
  },
  {
    title: "Agent skills — SKILL.md as reusable instructions",
    source: "digest",
    url: "https://docs.anthropic.com/en/docs/claude-code/skills",
    published: "",
  },
  {
    title: "OpenAI Codex CLI for the terminal",
    source: "digest",
    url: "https://github.com/openai/codex",
    published: "",
  },
  {
    title: "GitHub Copilot custom instructions",
    source: "digest",
    url: "https://docs.github.com/en/copilot",
    published: "",
  },
  {
    title: "Superpowers — SDLC skills for coding agents",
    source: "digest",
    url: "https://github.com/obra/superpowers",
    published: "",
  },
];

/** Parse HN Algolia `search_by_date` JSON. Exported for tests. */
export function parseAlgolia(json: unknown): NewsItem[] {
  if (!json || typeof json !== "object") return [];
  const hits = (json as { hits?: unknown }).hits;
  if (!Array.isArray(hits)) return [];
  const out: NewsItem[] = [];
  const seen = new Set<string>();
  for (const raw of hits) {
    if (!raw || typeof raw !== "object") continue;
    const hit = raw as { title?: unknown; url?: unknown; objectID?: unknown; created_at?: unknown };
    const title = typeof hit.title === "string" ? hit.title.trim() : "";
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const objectID = typeof hit.objectID === "string" || typeof hit.objectID === "number" ? String(hit.objectID) : "";
    const url =
      typeof hit.url === "string" && hit.url.trim()
        ? hit.url.trim()
        : objectID
          ? `https://news.ycombinator.com/item?id=${objectID}`
          : "";
    const published = typeof hit.created_at === "string" ? hit.created_at : "";
    out.push({ title, source: "HN", url, published });
  }
  return out;
}

/** Dedupe and keep on-topic headlines. Exported for tests. */
export function selectHeadlines(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const picked: NewsItem[] = [];
  for (const it of items) {
    if (!RELEVANT.test(it.title) && !RELEVANT.test(it.url)) continue;
    const key = it.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(it);
    if (picked.length >= MAX_ITEMS) break;
  }
  return picked;
}

/** Fetch live HN. Empty or failed responses are not cached. */
export async function fetchNews(fetcher: typeof fetch = fetch): Promise<NewsResult> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.result;
  const batches = await Promise.all(
    TOPICS.map(async (q) => {
      try {
        const res = await fetcher(algoliaUrl(q), {
          signal: AbortSignal.timeout(8000),
          headers: { "user-agent": UA, accept: "application/json" },
        });
        if (!res.ok) return [] as NewsItem[];
        return parseAlgolia(await res.json());
      } catch {
        return [] as NewsItem[];
      }
    }),
  );
  const items = selectHeadlines(batches.flat());
  if (items.length > 0) {
    const result: NewsResult = { items, live: true };
    cache = { at: now, result };
    return result;
  }
  return { items: NEWS_DIGEST, live: false };
}

export async function loadNews(fetcher: typeof fetch = fetch): Promise<NewsResult> {
  if (process.env.VITEST && process.env.PDH_LIVE_NEWS !== "1" && process.env.PDH_TEST_NEWS !== "1") {
    return {
      items: [
        {
          title: "MCP servers for local coding agents",
          source: "HN",
          url: "https://news.ycombinator.com",
          published: "",
        },
      ],
      live: true,
    };
  }
  return fetchNews(fetcher);
}

/** Test hook. */
export function clearNewsCache(): void {
  cache = null;
}
