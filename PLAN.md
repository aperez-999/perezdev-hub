# PerezDev Hub — Implementation Plan

> Current TUI (Chat, Skills, MCP, News) is specified in [`docs/tui-design-spec.md`](docs/tui-design-spec.md). Notes below that still mention three pages are historical.
>
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

**Follow** [`docs/tui-design-spec.md`](docs/tui-design-spec.md) (plus `PRODUCT.md` / `DESIGN.md`). Implement slices A→G in that spec; do not invent a fourth page.

- [~] **Split `console.tsx`.** Partial: extracted the `commands` registry
      (`src/tui/commands.ts`), page nav (`src/tui/nav.ts`), model picker overlay,
      `shell`/`statusbar`/`slash`/`help` + the three pages. The environment rail is
      gone. The `useHubActions` hook and `useReducer` state consolidation are still
      TODO (state remains in `console.tsx`). *Verify:* tests green; `/help` is
      generated from the registry.
- [x] **Single source of `/help`.** `helpLines()` + `SlashMenu` both read
      `COMMANDS` in `src/tui/commands.ts`, so they cannot drift. *Verified:* `/help` test
      asserts a registry command (`/build`) appears.
- [x] **In-TUI diff preview before write.** `ConfirmBox` takes a `diff: string[]`;
      `planDescribed`/`planCatalogMcp` + `plannedToDiff` (`data.ts`) feed planned files for
      `/build`, `/create`, `/install`, `/mcp` and the F2/F3 flows. *Verified:* F3 install
      confirm test renders the dialog; `n` writes nothing.
- [x] **Keyboard help overlay (`?`).** `src/tui/help.tsx` — KEYS + SLASH COMMANDS
      columns, full-replace overlay. *Verified:* `?` opens, `esc` closes (test).
- [x] **Capped activity log** with category tags. `LogLine.cat` set at push time;
      F3 staging filters `cat === "mcp"`; the visible window derives from terminal height.
      *Verified:* TUI tests.
- [x] **Version from package metadata.** `src/tui/version.ts` walks up to the
      `perezdev-hub` package.json (dev + bundled); `shell.tsx` shows `v{version}`.
      *Verified:* header shows `v0.2.0` (test).
- [x] **Provider UX:** model picker (`Ctrl+M` → selectable list, with cloud entry),
      offline banner on the chat page, `/pull` streams progress into the activity line.
      *Verified:* smoke + tests. (`/pull` is a streamed line, not yet a graphical bar.)

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

- [x] **Lazy-load Ink + heavy deps** so plain CLI commands start fast (don't import
      the TUI tree for `list`/`doctor`). *Verify:* `perezdev list` no longer statically imports Ink; TUI loads on default TTY entry.
- [x] **Parallelize adapter detection** (`detectAll` → `Promise.all`). *Verified:* unit tests; `loadHome` now also parallelizes scan + ecosystem + lockfile reads.
- [ ] **Cache project scan** in `.perezdevrc` with a cheap invalidation key
      (lockfile mtime / file count). *Verify:* second `recommend` run skips re-scan; test.
- [x] **Reuse one engine process** across a command's calls (the `Engine` class
      exists — ensure single instance per run). *Verified:* engine test reuses one process; TUI holds one `Engine` for the session.

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
