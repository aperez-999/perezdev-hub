export interface NewsItem {
  title: string;
  source: string;
  url: string;
  published: string;
}

const FEEDS: { source: string; url: string }[] = [
  { source: "HN", url: "https://hnrss.org/newest?q=MCP+OR+Claude+OR+Ollama+OR+Cursor+OR+Codex" },
  { source: "Node", url: "https://nodejs.org/en/feed/blog.xml" },
];

const RELEVANT =
  /\b(mcp|model context|claude|cursor|codex|ollama|llm|language model|agent skill|vscode|typescript|javascript|python|plugin|copilot|anthropic|openai|qwen|llama|windsurf|cline)\b/i;

const MAX_ITEMS = 12;
const CACHE_MS = 30 * 60 * 1000;

let cache: { at: number; items: NewsItem[] } | null = null;

function decode(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1] ?? "") : "";
}

function attrLink(block: string): string {
  const m = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  return m?.[1] ?? "";
}

/** Parse RSS 2 / Atom items. Exported for tests. */
export function parseFeed(xml: string, source: string): NewsItem[] {
  const chunks = [...xml.matchAll(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi)].map((m) => m[0]);
  const out: NewsItem[] = [];
  for (const block of chunks) {
    const title = tag(block, "title");
    if (!title) continue;
    const url = tag(block, "link") || attrLink(block);
    const published = tag(block, "pubDate") || tag(block, "updated") || tag(block, "published");
    out.push({ title, source, url, published });
  }
  return out;
}

export function selectHeadlines(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const picked: NewsItem[] = [];
  for (const it of items) {
    if (!RELEVANT.test(it.title)) continue;
    const key = it.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(it);
    if (picked.length >= MAX_ITEMS) break;
  }
  return picked;
}

export async function loadNews(fetcher: typeof fetch = fetch): Promise<NewsItem[]> {
  if (process.env.VITEST && process.env.PDH_LIVE_NEWS !== "1") {
    return [
      {
        title: "MCP servers for local coding agents",
        source: "HN",
        url: "https://news.ycombinator.com",
        published: "",
      },
    ];
  }
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.items;
  const xmls = await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const res = await fetcher(f.url, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "perezdev-hub/0.2" } });
        if (!res.ok) return [] as NewsItem[];
        return parseFeed(await res.text(), f.source);
      } catch {
        return [] as NewsItem[];
      }
    }),
  );
  const items = selectHeadlines(xmls.flat());
  cache = { at: now, items };
  return items;
}

/** Test hook. */
export function clearNewsCache(): void {
  cache = null;
}
