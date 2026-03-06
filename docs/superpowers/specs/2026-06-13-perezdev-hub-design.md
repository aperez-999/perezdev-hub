# PerezDev Hub — Design Spec

Date: 2026-06-13
Status: Approved (brainstorming) — pending implementation plan

## Context

`inspo` today is a Node/TypeScript CLI that generates custom AI agent **skills** (`SKILL.md`-style, automation-ready) and manages them across multiple AI coding tools (Claude Code, Cursor, Copilot, Codex) via an adapter pattern, with an interactive clack menu and an Ink fullscreen dashboard.

We are evolving it into **PerezDev Hub** — a developer's AI-workflow hub. Inspiration scanned:
- **opendev** (terminal AI coding agent, multi-model fleet, CLI/TUI + web): we take the *hub / home-base* feel, **not** the autonomous-coding-agent or Rust/multi-model parts.
- **awesome-cli-coding-agents** (curated catalog of 80+ CLI agents scored by capabilities): we take the *curated discovery* idea.

**Decided scope:** a hub built *on top of* the existing inspo engine — keep generate/manage, add **Discover** (curated catalog) and **Stacks** (the signature twist: one-command setups). No autonomous coding agent, no multi-model runner.

## Goals

- Rebrand to PerezDev Hub without losing the working generate/manage engine.
- Add a curated, offline-first **Discover** catalog: CLI coding agents (informational + install command), MCP servers (installable), skill presets (installable).
- Add **Stacks**: install a matched bundle of skill presets + MCP servers across all detected tools in one command.
- Keep the UX easy/quick — no new navigation depth or extra wizard questions.

## Non-goals (v1)

- Remote registry refresh (design a seam for it; do not implement).
- Multi-model "fleet" runner / autonomous coding agent.
- Catalog browsing *inside* the Ink dashboard (Discover/Stacks live in the clack menu + commands; dashboard stays manage-focused).
- Auto-installing CLI coding agents (we only display their install command + link).

## Architecture

Three pillars on the existing core. Reuse `installSpec` / adapters / lockfile throughout.

```
src/registry/
  agents.ts        # CLI coding agent catalog: {id,name,desc,repo,install,tags,stars?} — info + install cmd only
  mcp-servers.ts   # MCP server catalog: {id,name,desc,command,args,tags} — installable
  stacks.ts        # curated Stacks: {id,summary,skillPresets:string[],mcpServers:string[],tags}
  index.ts         # load + lookup helpers (getAgent/listAgents/getMcpServer/getStack/...)
src/core/
  stack.ts         # installStack(id, targets, now) → resolve preset ids + mcp ids → install via core
  mcp-install.ts   # standalone MCP install (no agent) + lockfile MCP tracking
  lockfile.ts      # + `mcpServers` section
src/commands/
  discover.ts      # interactive browse of the catalog; install MCP/skill, show CLI-agent install cmd
  stacks.ts        # list stacks + install one (`stack <id>`)
  menu.ts          # + "🔭 Discover" and "📦 Stacks" entries
```

### Data model

- `RegistryAgent` — `{ id, name, description, repo, install, tags: string[], stars?: number }`. Informational; `install` is a copy-paste shell command shown to the user.
- `RegistryMcpServer` — `{ id, name, description, command, args: string[], tags: string[] }`. Installable: converted to an `McpDependency` and written into tool MCP configs.
- `Stack` — `{ id, summary, skillPresets: string[], mcpServers: string[], tags: string[] }`. `skillPresets` reference existing preset ids (`core/presets.ts`); `mcpServers` reference `mcp-servers.ts` ids.
- All registry data is **bundled** as TypeScript constants (no runtime fetch). `registry/index.ts` is the single access point — the seam where a future remote refresh would merge in.

### The one genuinely new mechanic: standalone MCP install

Today MCP servers are only installed as dependencies *of an agent* (via `shared.mergeMcpJson`, recorded inside an `AgentSpec` in the lockfile). Discover/Stacks need to install an MCP server on its own.

- `core/mcp-install.ts`:
  - `installMcpServer(server: RegistryMcpServer, targets, now)` → for each target that supports MCP (claude-code → `~/.claude/settings.json`, cursor → `~/.cursor/mcp.json`), back up + merge via the existing `mergeMcpJson` helper (refactored to take a bare `McpDependency[]` instead of an `AgentSpec`). Codex/Copilot are skipped (no MCP support in v1) with a logged notice.
  - `removeMcpServer(id, ...)` → prune via `pruneMcpJson`.
- `core/lockfile.ts` gains an `mcpServers` map (`{ [id]: { server, targets, installedAt } }`) alongside `agents`, validated with zod. `list` / `manage` / `doctor` / `remove` are extended to include MCP servers, not just agents.

### Stacks flow

`installStack(id, targets, now)`:
1. Resolve the stack's `skillPresets` → `GenerateInput` (existing preset → `generateSpec`) → `installSpec` for each.
2. Resolve the stack's `mcpServers` → `installMcpServer` for each.
3. Return a summary (counts, per-item status). Command layer renders a single diff preview + one confirm (respect `--yes` / non-TTY auto).

Stacks shipped in v1 (small, curated): `review` (code-reviewer + debugger + test-writer), `backend` (api + sql/db presets + a DB MCP server), `frontend` (doc-writer + relevant presets), `docs` (doc-writer + commit-helper). Exact membership finalized during implementation against available presets/MCP entries.

### Branding

- `package.json`: name `perezdev-hub`; `bin` = `perezdev` (primary) + `pdh` + `inspo` (back-compat) → all point at `dist/index.js`.
- Config dir: `~/.config/inspo` → `~/.config/perezdev` (`core/config.ts`). Fresh start; no migration shim (no external users).
- Intro banners (`" inspo "` → `" PerezDev Hub "`), `--name`, README retitle. `commander` `.name("perezdev")`.

### Commands (new + changed)

- `perezdev discover` — interactive catalog browse (kind filter: agents / MCP / skills; tag filter); actions: install (MCP, skill), show install command (CLI agents). Non-TTY → print a flat catalog listing.
- `perezdev stacks` — list curated stacks.
- `perezdev stack <id>` — install a stack; `-t/--target`, `-y/--yes`.
- Menu (`inspo` bare) gains 🔭 Discover and 📦 Stacks entries.
- `list` / `manage` / `doctor` / `remove` extended to cover installed MCP servers.

## Error handling

- Unknown stack / catalog id → clean message + pointer to the list command, non-zero exit.
- MCP install on a tool lacking MCP support (codex/copilot) → skip with a logged notice, not an error.
- All file writes use existing `fs-safe` (backup + atomic). Stack install is best-effort per item; failures are reported in the summary, not silently dropped.

## Testing

- `registry/index.ts` load + lookup (every stack's `skillPresets`/`mcpServers` ids resolve to real catalog entries — guards against dangling references).
- `core/mcp-install.ts` + lockfile MCP section: install an MCP server into a sandbox HOME → assert `settings.json` / `mcp.json` entries + lockfile record; remove → assert pruned.
- `core/stack.ts`: `installStack` in a sandbox HOME → assert expected `SKILL.md` files + MCP entries + lockfile records (agents and mcpServers).
- Existing 28 tests stay green (branding/config-dir changes must not break them).
- Interactive `discover`/`stacks`/menu are TTY-only; test their resolve/install core directly, not the clack UI.

## Verification (manual, sandbox HOME)

```
npm run build
HOME=/tmp/pdh node dist/index.js stacks
HOME=/tmp/pdh node dist/index.js stack review -y      # installs the bundle
HOME=/tmp/pdh node dist/index.js list                 # shows agents + MCP servers
HOME=/tmp/pdh node dist/index.js doctor
```

## Rollout

Stage changes; do not commit (standing user preference — user commits manually).
