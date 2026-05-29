# Auto-Fix Loop — Design

**Status:** approved (brainstorm) · **Date:** 2026-06-15

## Goal

Extend the existing read-only `/diagnose` engine into a closed **auto-fix loop**: given a
traceback, the active LLM proposes a surgical code patch (and/or a dependency install),
PerezDev applies it under the existing backup/rollback safeguards, re-runs a verify
command, and repeats until the error clears or a cap is hit. Every mutating step is gated
by the existing `[Y] Approve / [N] Cancel` confirm dialog and Manual/Autonomous setting.

This is the first "make it act" slice — it turns the hub from a config manager into a
tool that closes the loop on a concrete, bounded task.

## Scope (decided)

- **Actions:** `patch` (edit the offending file), `install` (run a dependency install
  command), `verify` (re-run to confirm). Plus `done`.
- **Patch format:** search/replace blocks `{find, replace}` applied precisely (not
  full-file rewrite, not unified diff).
- **Verify command:** inferred from the error kind + project scan, shown to the user to
  confirm/edit before the first run.
- **Guardrails:** hard cap of 3 fix attempts; a denylist that refuses obviously
  destructive commands (`rm -rf`, `sudo`, `curl|sh`, `git push`, force-push, `dd`,
  `mkfs`, `shutdown`, redirects to `/dev/…`) even in Autonomous mode; file writes use the
  existing cacheBackup + atomicWriteValidated + withRollback.

## Architecture

All new units are small and dependency-injected so the loop is testable without a real
shell or LLM.

| Unit | Responsibility |
| --- | --- |
| `src/core/exec.ts` | Run a shell command via `execa` (already a dep): denylist guard, timeout, cwd, capture `{stdout, stderr, code}`. `isDangerous(cmd)` is exported + pure. |
| `src/util/fs-safe.ts` → `applyEdits` | Apply `[{find, replace}]` to a file precisely; each `find` must occur exactly once; reuses cacheBackup + atomicWriteValidated; returns a before/after diff preview. |
| `src/core/fix-prompt.ts` | Build the metaprompt (error + kind + hint + root-file snippet + last command output) and tolerantly parse the model's next action JSON. |
| `src/core/autofix.ts` | The orchestrator. Pure loop; takes `{diagnosis, scan, callProvider, exec, confirm, applyEdits, readFile}` injected. Returns a transcript. |

### Action schema (model output, one per turn)

```json
{ "kind": "install", "command": "pip install requests", "reason": "..." }
{ "kind": "patch", "file": "app/main.py", "edits": [{ "find": "...", "replace": "..." }], "reason": "..." }
{ "kind": "verify" }
{ "kind": "done", "reason": "..." }
```

Parser is tolerant (strips ``` fences, extracts the first balanced object) like the
existing `parseMcpConfig`.

## Loop flow

1. `engineDiagnose(file)` → `{ kind, message, frames, hint }`. No locatable frame and no
   hint → report "couldn't localize" and stop.
2. Infer the verify command from `kind` + scan (python → `pytest` if tests else
   `python <frame.file>`; node → `npm test`; fallback: re-run nothing, ask). Show it; the
   user confirms or edits before the first run.
3. For attempt `1..3`:
   a. Build the prompt (error, hint, root-file snippet around `frame.line`, previous
      command output). Ask for one action as raw JSON.
   b. Parse. Unparseable → log, count the attempt, continue.
   c. Execute by kind: `install`/`verify` command → `isDangerous` guard → `confirm` →
      `exec`; `patch` → `applyEdits` with a diff preview → `confirm` → write.
   d. Run the verify command, capture output.
   e. Success = exit 0 **and** the original error signature absent from output → stop,
      report success. Else feed output into the next attempt.
4. Stop on: success | cap reached | user cancels a confirm | model returns `done`.
5. Report a transcript: attempts, files changed, commands run, final pass/fail, and how
   to re-verify.

## Surfaces

- **TUI:** new slash `/autofix <logfile>` in the chat page. The loop streams into the log;
  each mutating action routes through the existing `guard()`/`ConfirmBox`. The F2
  *Run Workspace Diagnoser* output gains a "→ `/autofix` to repair" hint.
- **CLI:** `perezdev autofix [file]` (diagnose + loop; `-y` autonomous; reads piped stdin
  like `fix`).

The orchestrator reuses the existing `callProvider` (local Ollama or cloud) and
`engineDiagnose`. If no provider is reachable, `/autofix` reports the same friendly hint
as a normal prompt and does nothing destructive.

## Error handling

- Model returns invalid JSON or an action that doesn't fit → logged, counts as an attempt,
  loop continues within the cap.
- A `find` snippet that isn't found (or isn't unique) → reported; the file is untouched;
  the model can retry with corrected context next attempt.
- Command times out → captured as a failed verify; loop continues.
- File-write failure mid-patch → `withRollback` restores every touched file.
- Destructive command → blocked with a clear message; never executed.

## Testing

All with injected fakes — no real shell or LLM:

- `exec` denylist: `isDangerous` blocks `rm -rf`, `sudo`, pipes-to-shell, force-push, etc.
- `applyEdits`: applies a unique find/replace; errors on missing/ambiguous find; rolls
  back on failure.
- `fix-prompt` parser: parses each action kind; tolerates fences/prose; rejects garbage.
- `autofix` loop: injected provider returns canned actions → asserts it applies a patch,
  runs verify, stops on success, and respects the 3-attempt cap and a cancelled confirm.

## UI polish (folded into this round)

- **Minimize emojis:** drop the emoji glyphs from the tab bar and the MCP directory; use
  short text markers / aligned status dots instead. Professional, dev-friendly.
- **Spacing:** consistent one-line breathing room between sections on every page; no
  clustered blocks.
- **Controls/keys:** a consistent dim keyhint row per page (chat: slash hints; F2: `↑↓
  Enter Esc`; F3: `Tab ↑↓ Enter`) plus a clearer footer.

## Out of scope (future slices)

General free-form task agent, multi-file refactors, running the generated skills,
sandboxed execution. This slice is intentionally the bounded fix loop.
