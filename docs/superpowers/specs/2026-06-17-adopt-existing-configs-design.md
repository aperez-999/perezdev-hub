# Design: `adopt` — Bring Existing Per-Tool AI Configs Under Management

**Date:** 2026-06-17
**Status:** Approved (design) — ready for implementation plan
**Author:** Alejandro Perez
**Feature area:** `src/core/`, `src/adapters/`, `src/commands/`, `src/tui/`

---

## 1. Summary

`perezdev adopt` discovers the AI-coding-config files already on a developer's
machine that PerezDev Hub did **not** create, reverse-parses each into the
canonical `AgentSpec`, and ingests them into the lockfile. Once adopted, an item
is a first-class managed agent: `list`, `show`, `update`, `remove`,
`profile export`, and mirror-to-other-tools all work on it with no extra code.

This is the **inverse** of the existing one-directional flow
(`AgentSpec → adapter.write()`). Today an adapter only *emits* a tool's native
format and only *lists* items it owns (via an ownership marker). `adopt` adds the
read direction: enumerate the unowned files and parse them back into a spec.

## 2. Motivation / differentiation

The project's moat is the **canonical `AgentSpec` + one-adapter-per-tool** layer:
"describe a goal once, deploy a real agent across every AI coding tool, tracked
in a lockfile." Single-tool assistants (Cursor, Claude Code, aider) cannot do
cross-tool config because they only see themselves.

Today perezdev only manages what *it* generated. Most developers already have
hand-written rules/skills scattered across tools. `adopt` turns the product from
"manages what I made" into "manages my whole AI-config estate, portably" — the
headline cross-tool differentiator — and it is built almost entirely from parts
that already exist (`scan`, adapters, `lockfile`, `installSpec`, `fs-safe`
rollback, the dependency-free frontmatter helper).

## 3. Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Direction | Bidirectional import ("adopt existing configs") | Highest leverage on the canonical-spec moat. |
| Source scope (v1) | **Per-agent files only** | Clean 1:1 file→spec mapping, high fidelity, low risk. Monolithic blobs deferred. |
| Field normalization | **Heuristic-only, deterministic, offline** | Matches the local-first, deterministic-template ethos; no provider dependency; reproducible. |
| Source-file mutation | **None** (read-only ingest) | Safe by construction; adoption is reversible because it never touches the original file. |
| Mirroring to other tools | **Explicit opt-in** (`--mirror`) | Keeps file writes intentional; reuses the hardened `installSpec` path. |

## 4. Sources (v1)

Per-agent (1:1 file → one `AgentSpec`), implemented by these adapters:

| Tool | Source location | Shape |
| --- | --- | --- |
| Claude Code | `~/.claude/skills/<name>/SKILL.md` | frontmatter + markdown body |
| Cursor | `~/.cursor/rules/<name>.mdc` | frontmatter + markdown body |
| Codex | `~/.codex/prompts/<name>.md` | markdown (frontmatter optional) |

**Explicitly out of scope for v1** (YAGNI): monolithic instruction blobs
(`.cursorrules`, `.github/copilot-instructions.md`, `.clinerules`,
`.windsurfrules`, `AGENTS.md`); LLM-assisted metadata synthesis; MCP-server
adoption from `settings.json`/`mcp.json`; drift detection / continuous sync.

## 5. Architecture

### 5.1 Reverse-adapter method

Add one **optional** method to the `Adapter` interface (`src/adapters/types.ts`):

```ts
/** A config item present in a tool that perezdev does NOT own — an adopt candidate. */
export interface DiscoveredItem {
  name: string;       // raw item name (filename stem or skill dir name)
  tool: ToolId;
  path: string;       // absolute path of the backing file
  content: string;    // raw file contents, for reverse parsing
}

export interface Adapter {
  // ...existing members unchanged...

  /**
   * Read-only. Enumerate items in this tool's config that perezdev does NOT
   * own (i.e. would NOT appear in `list()`), as candidates for `adopt`.
   * Adapters that have no per-agent source omit this method.
   */
  discover?(): Promise<DiscoveredItem[]>;
}
```

- `discover()` is the mirror of `list()`: `list()` returns items where
  `isOwned(content)` is true; `discover()` returns items where it is **false**,
  with raw `content` attached for parsing.
- Implemented in v1 by `ClaudeCodeAdapter`, `CursorAdapter`, `CodexAdapter`.
- All other adapters leave it `undefined`; callers treat absence as "no
  candidates."
- The shared enumeration logic (read a directory, read each file, partition by
  `isOwned`) should be factored into a small helper in `src/adapters/shared.ts`
  to avoid duplication across the three implementers.

### 5.2 Reverse parser — `src/core/adopt.ts`

Pure, deterministic, offline. No provider calls.

```ts
export interface AdoptCandidate {
  spec: AgentSpec;          // a fully valid spec
  sourceTool: ToolId;
  sourcePath: string;
  conflict: boolean;        // true if spec.name already exists in the lockfile
}

export function parseAdopted(item: DiscoveredItem, takenNames: Set<string>): AdoptCandidate;
```

Field derivation rules (deterministic):

| Spec field | Rule |
| --- | --- |
| `name` | `slugify(frontmatter.name ?? filenameStem)`; on collision with `takenNames`, append `-2`, `-3`, … and set `conflict = true`. |
| `instructions` | The markdown body verbatim (lossless). If the file has no frontmatter, the whole file is the body. |
| `description` | `frontmatter.description` → else first `#`/`##` heading text → else first non-empty sentence. Clamp to 8–400 chars. If still `< 8`, fall back to `"adopted ${name} rule from ${tool}"`. |
| `role` | `frontmatter.role` → else `"${name} assistant"` (≥ 4 chars guaranteed by slug min length). |
| `allowedTools` | Parse `allowed-tools` / `tools` frontmatter key if present and array-like; else `[]`. |
| `mcpDependencies` | `[]` (MCP adoption is out of scope for v1). |
| `targets` | `[sourceTool]`. |
| `version` | `frontmatter.version` if valid, else schema default `"0.1.0"`. |
| `source` | `"adopted"`. |

Frontmatter parsing reuses the existing dependency-free helper in
`src/adapters/shared.ts` (the one that replaced `gray-matter`/`js-yaml`). The
parser must produce a spec that passes `agentSpecSchema.parse` — validate before
returning; a candidate that cannot be normalized into a valid spec is reported
as a skipped item with a reason, not a thrown error that aborts the run.

### 5.3 Schema change

`src/core/agent-spec.ts` — extend the provenance enum:

```ts
source: z.enum(["generated", "imported", "adopted"]).default("generated"),
```

Backward compatible: existing lockfiles/specs keep their `source`; default
unchanged. Audit call sites that switch on `source` (if any) for the new value.

### 5.4 Orchestration — `src/core/adopt.ts`

```ts
/** Run discover() on every implementing adapter (optionally limited), parse all
 *  candidates, and flag name collisions against the current lockfile. */
export async function discoverAdoptable(opts?: { tools?: ToolId[] }): Promise<AdoptCandidate[]>;

/** Ingest a candidate's spec into the lockfile (read-only to the source tool).
 *  Optionally mirror it into `mirrorTo` tools via installSpec. `now` injected for determinism. */
export async function adoptCandidate(
  candidate: AdoptCandidate,
  now: string,
  opts?: { mirrorTo?: ToolId[]; force?: boolean },
): Promise<{ adopted: boolean; mirroredPaths: string[] }>;
```

- Adoption = `upsertAgent(spec, now)` only. **No write to the source file.**
- A collision (`conflict` and not `force`) is skipped with a note; `force`
  overwrites the lockfile entry.
- Mirroring (when `mirrorTo` non-empty) builds a spec with
  `targets = mirrorTo` and calls the existing `installSpec` (backup → atomic →
  rollback). This is the only step that writes files.

## 6. Command surface — `src/commands/adopt.ts`

`perezdev adopt`:

- **Interactive (no flags):** scan per-agent tools → show a checklist
  (`tool · name · description`) of discovered unowned items → user selects → ask
  "mirror selected to which tools?" (default: none / adopt-only) → confirm.
- **Flags:**
  - `--tool <id>` — limit discovery to one source tool.
  - `--mirror <ids|all>` — after adopting, install into the named tools (or all
    detected).
  - `--dry-run` — preview planned writes (reuse `planSpec`) and lockfile changes;
    write nothing. Consistent with the Phase-1 global `--dry-run`.
  - `-y, --yes` — non-interactive: adopt every discovered candidate.
  - `--force` — re-adopt over a lockfile name collision.
  - `--json` — machine-readable list of discovered/adopted items (consistent
    with the flat-object `--json` decision in PLAN Phase 1).
- Register in `src/index.ts` alongside the other commands.

### TUI integration (minimal v1)

A `/adopt` slash command on the chat page: runs `discoverAdoptable()`, lists
candidates in the activity log (category `build`), and adopts the selected /
confirmed set through the existing manual-confirm (`guard`) path with a
planned-file diff when `--mirror`-equivalent targets are chosen. A dedicated F2
panel is deferred.

## 7. Data flow

```
adapter.discover()            (read-only, per tool)
  → DiscoveredItem[]
  → parseAdopted()            (deterministic, offline)
  → AdoptCandidate[] (+conflict flags)
  → user selection / -y
  → upsertAgent()             (lockfile = source of truth)        [always]
  → installSpec(targets)      (backup → atomic → rollback)        [only if --mirror]
  → now a first-class managed agent (list/show/update/remove/profile/sync)
```

## 8. Safety

- `adopt` itself performs **zero writes** to tool config files — it only reads
  source files and writes the lockfile (atomic, as today).
- The only file writes are mirroring, which reuses `installSpec`'s existing
  guarantees: timestamped backup into the app cache, validated atomic write via
  temp file, full rollback if a multi-file install throws.
- In the TUI, mirroring is gated by the `[Y] Approve / [N] Cancel` dialog (auto
  only in Autonomous mode), like every other write.
- Never touches shell rc files; only standard per-tool user config dirs.

## 9. Testing

Unit + integration (vitest), against temp `HOME`/cwd as in existing tests:

1. **Reverse-parse fidelity:** frontmatter present (name/description/role
   honored); frontmatter absent (body→instructions, name from filename); a body
   with only a heading → description from heading; too-short description →
   fallback string; slug collision → `-2` suffix + `conflict = true`.
2. **`discover()` per adapter:** temp config dir with one owned file + one
   unowned file → only the unowned one is returned, with raw content.
3. **Adopt ingest:** `adoptCandidate` → `listEntries()` shows it; source file is
   byte-identical afterward (proves read-only).
4. **Mirror:** `--mirror` to a second tool writes that tool's native file;
   `--dry-run` writes nothing (assert no FS changes, no lockfile change).
5. **Round-trip:** adopt a Cursor `.mdc` → mirror to Claude Code → the generated
   `SKILL.md` body equals the original rule's instructions.
6. **Schema:** a spec with `source: "adopted"` parses; existing lockfiles still
   load.

## 10. File-by-file plan

| File | Change |
| --- | --- |
| `src/core/agent-spec.ts` | Add `"adopted"` to the `source` enum. |
| `src/adapters/types.ts` | Add `DiscoveredItem` + optional `discover()`. |
| `src/adapters/shared.ts` | Shared "enumerate + partition by `isOwned`" helper; ensure frontmatter parser is reusable for reading. |
| `src/adapters/claude-code.ts` | Implement `discover()` (skills dir). |
| `src/adapters/cursor.ts` | Implement `discover()` (rules dir). |
| `src/adapters/codex.ts` | Implement `discover()` (prompts dir). |
| `src/core/adopt.ts` | **New** — `parseAdopted`, `discoverAdoptable`, `adoptCandidate`. |
| `src/commands/adopt.ts` | **New** — CLI command (interactive + flags). |
| `src/index.ts` | Register `adopt`. |
| `src/tui/console.tsx` + `commands.ts` | `/adopt` slash command + registry entry. |
| `test/adopt.test.ts` | **New** — section 9 cases. |
| `README.md` | Document `adopt` in the CLI table + a short section. |

## 11. Open questions / fast-follow (not v1)

- **MCP adoption:** enumerate servers in `settings.json`/`mcp.json` not in the
  lockfile and `upsertMcpEntry` them. The lockfile already models standalone MCP
  entries — natural next increment.
- **Monolithic blob adoption** (one "house-rules" spec per file).
- **Drift detection:** compare an adopted spec against its (now possibly edited)
  source file and reconcile — a separate feature.
