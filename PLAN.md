# PerezDev Hub — Implementation Plan

> Roadmap to make the CLI **highly executable and great for developers**: fast,
> safe, scriptable, and pleasant in the terminal. Phased and prioritized.
> Check items off (`[x]`) as they land; each carries a verification step.

Legend: **P0** = ship-blocking polish · **P1** = high-leverage DX · **P2** = nice-to-have / future.

---

## Phase 0 — Pre-release hardening (DONE, staged)

Already implemented and verified (110 tests green, prod `npm audit` = 0):

- [x] Autofix shell-exec hardening — install allowlist, no shell, no `--yes` auto-exec, patch-path confinement (`src/core/exec.ts`, `src/commands/autofix.ts`, `src/core/fix-prompt.ts`).
- [x] Profile-import SSRF guard + no redirects (`src/commands/profile.ts`).
- [x] Brand migration `inspo → perezdev` with legacy back-compat reads (`x-inspo` marker, `.inspo.bak`).
- [x] Dropped vulnerable `gray-matter`/`js-yaml`; dependency-free frontmatter helper (`src/adapters/shared.ts`).
- [x] `package.json` URLs + dropped legacy `inspo` bin alias.

---

## Phase 1 — Safety & scriptability parity (P0) — DONE, staged

Implemented and verified (121 tests green, prod `npm audit` = 0, e2e smoke passed).

- [x] **`--dry-run` global flag** on `create`, `stack`, `import`, `profile import`,
      `update`. Prints the planned-file diff (reuses `renderDiff` + `planSpec`/
      `planStack`/`planMcpServer`); writes nothing, no lockfile change.
      *Verified:* unit test asserts no FS writes; CLI smoke confirms.
- [x] **`doctor --fix`** — re-applies the lockfile via `installSpec`/`installMcpServer`
      for anything missing (backed up, atomic), then re-checks. Also fixed the MCP
      presence check to parse JSON instead of a regex (review nit).
      *Verified:* delete SKILL.md → `doctor` flags it → `doctor --fix` restores; test + e2e.
- [x] **MCP management parity** — `show <id>` now falls back to a standalone MCP
      server (mirrors the existing `remove <id>` fallback). *Verified:* `show --json` MCP test.
- [x] **Wider `--json`** on `show`, `doctor`, `profile show` (decision: **flat domain
      objects**, consistent with `list --json` — no envelope). *Verified:* parse tests + smoke.
- [x] **`.perezdevrc` defaults** — `default_targets` (skips the target prompt; precedence
      flag → rc → detected → all) and `default_provider` (cloud/local preference,
      honored by `resolveProvider`). New shared `src/core/targets.ts` also removes the
      4× duplicated `resolveTargets` (review nit). TUI save preserves these fields.
      *Verified:* precedence + rc-parse tests; e2e shows prompt skipped.

## Phase 2 — Terminal UI overhaul (P0/P1)

Goal: less clustered, animated where it helps, no template feel, no drift.

- [ ] **Split `console.tsx` (713 LOC).** Extract into: `useHubActions` hook
      (build/install/mcp/autofix wiring), a `commands` registry (one map: name →
      {handler, help}), and a `useReducer` for the ~15 cross-dependent `useState`.
      *Files:* `src/tui/console.tsx` → `src/tui/use-hub-actions.ts`, `src/tui/commands.ts`, `src/tui/state.ts`.
      *Verify:* TUI tests still pass; `/help` is generated from the registry (cannot drift).
- [ ] **Single source of `/help`.** Derive the help list from the command registry
      so it never diverges from real handlers. *Verify:* test asserts every registry key appears in `/help`.
- [ ] **In-TUI diff preview before write.** Reuse `src/ui/diff.ts`; show planned
      changes in the confirm box for `/build`, `/create`, `/install`, `/mcp`.
      *Verify:* confirm box renders ≥1 diff line in the F2 build test.
- [ ] **Keyboard help overlay (`?`).** Toggleable cheatsheet of keys + slash commands.
      *Verify:* `?` opens overlay, `esc` closes; snapshot test.
- [ ] **Scrollable / capped activity log** with category tags (replace fragile
      content-sniffing regex in `staging`/`results`). Tag log lines with a `cat`
      field at push time. *Verify:* F3 staging shows only `cat:"mcp"` lines; test.
- [ ] **Version from package metadata.** `shell.tsx` hardcodes `v2.0`; read real
      version. *Verify:* header shows `package.json` version; test.
- [ ] **Provider UX:** model picker (`/models` → selectable), live `/pull` progress
      bar via the engine stream, clear offline banner. *Verify:* manual smoke + engine stream test.

## Phase 3 — Developer-experience features (P1)

- [ ] **Curated starter profiles.** Bundle a few opinionated profiles (e.g.
      `backend-node`, `python-data`, `frontend-react`) installable via
      `perezdev profile init <name>`. Reuses the existing profile importer.
      *Verify:* `profile init backend-node -y` installs its agents+MCP; test against temp HOME.
- [ ] **`perezdev sync`.** Idempotent re-apply of the lockfile across currently
      installed tools (covers "I installed a new editor, mirror my setup").
      *Verify:* install agent → add a second target tool → `sync` writes it there; test.
- [ ] **Shell completions.** `perezdev completion <zsh|bash|fish>` emitting a
      completion script (commander supports this pattern). *Verify:* generated script sources without error.
- [ ] **`perezdev adapter new <tool>`.** Scaffolds a new adapter file implementing
      the `Adapter` interface (the documented extensibility hinge). *Verify:* generated file type-checks and registers.
- [ ] **Graceful LLM fallback in TUI install path.** `src/tui/data.ts`
      `synthesizeInstructions` is unguarded; wrap so network/LLM failure degrades
      to the deterministic template (README already promises this). *Verify:* mock a throwing provider → install still succeeds with template; test.

## Phase 4 — Performance & startup (P1/P2)

- [ ] **Lazy-load Ink + heavy deps** so plain CLI commands start fast (don't import
      the TUI tree for `list`/`doctor`). *Verify:* `time perezdev list` improves; no Ink in the import graph for non-TUI commands.
- [ ] **Parallelize adapter detection** (`detectAll` → `Promise.all`). *Verify:* unit timing; behavior unchanged.
- [ ] **Cache project scan** in `.perezdevrc` with a cheap invalidation key
      (lockfile mtime / file count). *Verify:* second `recommend` run skips re-scan; test.
- [ ] **Reuse one engine process** across a command's calls (the `Engine` class
      exists — ensure single instance per run). *Verify:* one spawn per command in engine test.

## Phase 5 — Repo & contributor readiness (P1)

- [ ] **CI (GitHub Actions):** `typecheck` + `vitest` + `npm audit --omit=dev` + `build` on PR.
      *Verify:* workflow green on a test PR.
- [ ] **Coverage for the gaps the review flagged:** `commands/` layer,
      profile-import-from-URL (mock fetch), `llm/synthesize` + fallback, end-to-end
      install rollback (fault injection). *Verify:* new tests pass; coverage report.
- [ ] **`CONTRIBUTING.md` + adapter guide + issue templates.** Document the
      one-file-per-tool adapter model. *Verify:* docs render; links resolve.
- [ ] **README accuracy pass.** Clarify "detected" vs "written-to" tools (aider is
      detect-only); confirm every documented command exists. *Verify:* doc-vs-`--help` diff is empty.

---

## Sequencing & rationale

1. **Phase 1 first** — it's the safety/scripting contract users rely on; small, high trust.
2. **Phase 2** — the UI is the product's face; the `console.tsx` split unblocks every later TUI change and kills `/help` drift.
3. **Phase 3** — features that compound on the now-clean core.
4. **Phases 4–5** in parallel once the surface is stable.

## Non-goals (explicit)

- No hosted registry/server, no telemetry, no paid tiers — offline-first, local-only.
- No new runtime: stay TypeScript + the stdlib Python engine.
- Profiles stay file/URL based (no backend).

## Open decisions

- ~~`--json` shape~~ → **Resolved: flat domain objects** (consistent with `list --json`; no envelope). [Phase 1]
- ~~TUI page count~~ → **Resolved: keep three pages** for now; revisit a tabbed "Build" page during the Phase 2 `console.tsx` split.
- Starter-profile set — which 3–4 stacks to bundle (Phase 3). *Still open.*
