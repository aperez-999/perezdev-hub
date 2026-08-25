import { describe, expect, it } from "vitest";
import { parseFeed, selectHeadlines } from "../src/core/news.js";
import { parseLocalIntent } from "../src/tui/local-intent.js";

describe("parseFeed", () => {
  it("reads RSS items", () => {
    const xml = `
      <rss><channel>
        <item><title>New MCP server for SQLite</title><link>https://ex.test/1</link></item>
        <item><title>Unrelated sports score</title><link>https://ex.test/2</link></item>
      </channel></rss>`;
    const items = parseFeed(xml, "HN");
    expect(items[0]?.title).toBe("New MCP server for SQLite");
    expect(selectHeadlines(items).map((i) => i.title)).toEqual(["New MCP server for SQLite"]);
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
