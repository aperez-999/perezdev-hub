# Shareable Agent Profiles — Design

**Status:** approved (brainstorm) · **Date:** 2026-06-16

## Goal

Let a developer bundle their whole PerezDev setup — managed agents + standalone MCP
servers — into one portable JSON **profile**, and let anyone replicate it with a single
command from a file path or an `http(s)` URL (raw gist / GitHub). Fully local and
open-source: no server, no accounts, no new dependencies (Node's built-in `fetch`).

## Approach (chosen)

Single JSON profile, importable from a file or URL. Rejected alternatives: file-only
(less shareable) and git-repo-of-specs (needs git, heavier).

## Profile format

```json
{
  "perezdevProfile": 1,
  "name": "my-backend-setup",
  "createdAt": "2026-06-16T...",
  "agents": [ <AgentSpec>, ... ],
  "mcp": [ { "id": "git", "name": "Git", "dependency": { "name","command","args","env" } }, ... ]
}
```

`agents` are full `AgentSpec`s (already validated by `agentSpecSchema`); `mcp` mirrors the
lockfile's `McpEntry` minus install metadata. Validated by a new `profileSchema` (zod).

## Architecture

| Unit | Responsibility |
| --- | --- |
| `src/core/profile.ts` | Pure. `buildProfile(agents, mcp, name)` → Profile; `parseProfile(text)` → zod-validated Profile (throws with a readable message on bad input). `profileToServer(entry)` → a `RegistryMcpServer` for install. |
| `src/commands/profile.ts` | CLI `export` / `import` / `show`. Resolves a ref (file or `http(s)` URL), installs via existing `installSpec` + `installMcpServer`, skips already-installed unless `--force`, prints a summary. |

Reuses `listEntries`, `listMcpEntries`, `getAgentSpec`, `getMcpEntry`, `installSpec`,
`installMcpServer`, `detectAll`, fs-safe. No new registry/MCP logic.

## Commands

- `perezdev profile export [-o <file>]` — current setup → JSON (default `./perezdev-profile.json`, `-o -` for stdout).
- `perezdev profile import <file|url> [-t <tools>] [-y] [--force]` — replicate a setup; `-t` overrides targets (else detected/all), `--force` overwrites existing, `-y` skips the confirm.
- `perezdev profile show <file|url>` — preview name, agents, and MCP servers without installing.

## Data flow (import)

1. Resolve ref: `^https?://` → `fetch(ref).text()`; else read the file.
2. `parseProfile(text)` → validated Profile (clear error on malformed/incompatible).
3. Resolve targets: `-t` csv (validated against `TOOL_IDS`) → else detected installed tools → else all.
4. `show`-style summary; confirm unless `-y`.
5. For each agent: skip if `getAgentSpec(name)` exists and not `--force`, else `installSpec`.
6. For each MCP: skip if `getMcpEntry(id)` exists and not `--force`, else `installMcpServer(profileToServer(e))`.
7. Print a summary: installed / skipped counts per kind.

## Error handling

- Unreadable file / failed URL fetch → clear error, exit 1.
- Malformed or wrong-version JSON → `parseProfile` throws a readable validation message.
- A single agent/MCP that fails to install is reported; the rest continue (per-item, like discovery). File writes keep the existing backup/rollback.
- Empty profile → "nothing to install".

## Testing

- `buildProfile` round-trips lockfile entries into a valid profile.
- `parseProfile` accepts a good profile; rejects malformed JSON, wrong version, and bad specs.
- `profileToServer` maps an MCP entry to an installable server.
- Import (sandbox HOME): installs agents + MCP, skips already-installed without `--force`,
  overwrites with `--force`. URL vs file resolution covered with a file fixture.

## Out of scope

Hosted registry, profile discovery/search, versioned profile diffing. Sharing is "hand
someone a JSON file or a URL" — intentionally simple and serverless.
