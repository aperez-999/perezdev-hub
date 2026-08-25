import { afterEach, describe, expect, it } from "vitest";
import { clearNewsCache, fetchNews, NEWS_DIGEST, parseAlgolia } from "../src/core/news.js";
import { parseLocalIntent } from "../src/tui/local-intent.js";

afterEach(() => {
  clearNewsCache();
  delete process.env.PDH_TEST_NEWS;
});

const FIXTURE = {
  hits: [
    {
      title: "Show HN: local MCP server for SQLite",
      url: "https://example.test/mcp",
      objectID: "1",
      created_at: "2026-08-25T00:00:00.000Z",
    },
    { title: "Claude Code skills in the wild", url: "", objectID: "99", created_at: "2026-08-24T00:00:00.000Z" },
    { title: "Show HN: local MCP server for SQLite", url: "https://dup.test", objectID: "2" },
    { title: "", url: "https://skip.test", objectID: "3" },
  ],
};

describe("parseAlgolia", () => {
  it("reads story hits and falls back to the HN item url", () => {
    const items = parseAlgolia(FIXTURE);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Show HN: local MCP server for SQLite",
      source: "HN",
      url: "https://example.test/mcp",
    });
    expect(items[1]?.url).toBe("https://news.ycombinator.com/item?id=99");
  });

  it("returns nothing for garbage JSON", () => {
    expect(parseAlgolia(null)).toEqual([]);
    expect(parseAlgolia({ hits: "nope" })).toEqual([]);
  });
});

describe("fetchNews", () => {
  it("uses Algolia JSON and caches a non-empty live result", async () => {
    process.env.PDH_TEST_NEWS = "1";
    let calls = 0;
    const fetcher = (async () => {
      calls += 1;
      return new Response(JSON.stringify(FIXTURE), { status: 200 });
    }) as typeof fetch;
    const first = await fetchNews(fetcher);
    expect(first.live).toBe(true);
    expect(first.items[0]?.title).toContain("MCP");
    const second = await fetchNews(fetcher);
    expect(calls).toBe(1);
    expect(second.items).toEqual(first.items);
  });

  it("does not cache an empty fetch — falls back to the digest", async () => {
    process.env.PDH_TEST_NEWS = "1";
    let calls = 0;
    const empty = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ hits: [] }), { status: 200 });
    }) as typeof fetch;
    const first = await fetchNews(empty);
    expect(first.live).toBe(false);
    expect(first.items).toEqual(NEWS_DIGEST);
    const second = await fetchNews(empty);
    expect(second.live).toBe(false);
    expect(calls).toBe(2);
  });

  it("does not poison the cache on a failed fetch", async () => {
    process.env.PDH_TEST_NEWS = "1";
    const boom = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const miss = await fetchNews(boom);
    expect(miss.live).toBe(false);
    expect(miss.items[0]?.source).toBe("digest");

    const live = (async () => new Response(JSON.stringify(FIXTURE), { status: 200 })) as typeof fetch;
    const hit = await fetchNews(live);
    expect(hit.live).toBe(true);
    expect(hit.items[0]?.source).toBe("HN");
  });
});

describe("parseLocalIntent", () => {
  it("maps setup talk onto hub actions", () => {
    expect(parseLocalIntent("enable auto locally")).toEqual({ kind: "auto" });
    expect(parseLocalIntent("install the filesystem mcp server")).toEqual({ kind: "mcp", id: "filesystem" });
    expect(parseLocalIntent("how can i setup and install claude code")).toEqual({ kind: "skills" });
    expect(parseLocalIntent("what is a lockfile")).toEqual({ kind: "none" });
  });
});
