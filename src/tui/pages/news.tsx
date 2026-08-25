import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { theme } from "../theme.js";
import { loadNews, type NewsItem } from "../../core/news.js";

/** Page 4 — live headlines about MCP, skills, models, and languages. */
export function NewsPage({ sel }: { sel: number }): React.ReactElement {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadNews()
      .then((list) => {
        if (!alive) return;
        setItems(list);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : String(e));
        setItems([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const list = items ?? [];
  const idx = list.length ? ((sel % list.length) + list.length) % list.length : 0;

  return (
    <Box flexDirection="column" flexGrow={1} marginTop={1}>
      <Text color={theme.dim}>AI tooling feed</Text>
      {items === null && (
        <Box marginTop={1}>
          <Text color={theme.accent}>
            <Spinner type="dots" />
          </Text>
          <Text color={theme.fg2}> fetching headlines…</Text>
        </Box>
      )}
      {items && list.length === 0 && (
        <Text color={theme.muted}>{err ?? "No headlines (offline or nothing matched)."}</Text>
      )}
      {list.map((it, i) => {
        const on = i === idx;
        return (
          <Box key={`${it.source}-${it.title}`} marginTop={i === 0 ? 1 : 0}>
            <Box width={2} flexShrink={0}>
              <Text color={on ? theme.accent : theme.faint}>{on ? "›" : " "}</Text>
            </Box>
            <Box width={6} flexShrink={0}>
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
