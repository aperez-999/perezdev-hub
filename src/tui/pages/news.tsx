import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { theme } from "../theme.js";
import { loadNews, type NewsItem, type NewsResult } from "../../core/news.js";

/** Page 4 — live headlines about MCP, skills, models, and languages. */
export function NewsPage({ sel }: { sel: number }): React.ReactElement {
  const [result, setResult] = useState<NewsResult | null>(null);

  useEffect(() => {
    let alive = true;
    void loadNews()
      .then((r) => {
        if (!alive) return;
        setResult(r);
      })
      .catch(() => {
        if (!alive) return;
        setResult({ items: [], live: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  const list: NewsItem[] = result?.items ?? [];
  const idx = list.length ? ((sel % list.length) + list.length) % list.length : 0;

  return (
    <Box flexDirection="column" flexGrow={1} marginTop={1}>
      <Text color={theme.dim}>AI tooling feed</Text>
      {result === null && (
        <Box marginTop={1}>
          <Text color={theme.accent}>
            <Spinner type="dots" />
          </Text>
          <Text color={theme.fg2}> fetching headlines…</Text>
        </Box>
      )}
      {result && !result.live && list.length > 0 && (
        <Text color={theme.dim}>cached digest · live HN unavailable</Text>
      )}
      {result && list.length === 0 && <Text color={theme.muted}>No headlines.</Text>}
      {list.map((it, i) => {
        const on = i === idx;
        return (
          <Box key={`${it.source}-${it.title}`} marginTop={i === 0 ? 1 : 0}>
            <Box width={2} flexShrink={0}>
              <Text color={on ? theme.accent : theme.faint}>{on ? "›" : " "}</Text>
            </Box>
            <Box width={8} flexShrink={0}>
              <Text color={theme.dim}>{it.source}</Text>
            </Box>
            <Text color={on ? theme.accent : theme.fg} wrap="truncate-end">
              {it.title}
            </Text>
          </Box>
        );
      })}
      {list[idx]?.url ? (
        <Box marginTop={1}>
          <Text color={theme.dim} wrap="truncate-end">
            {list[idx].url}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
