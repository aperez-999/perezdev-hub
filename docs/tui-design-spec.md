# TUI redesign spec

**Status:** slices A–G landed (intro, quiet Chat, Skills form, MCP list, copy/`?`/README). Keep this file as the source of truth.  
**Follow:** `PRODUCT.md` (who/why) → `DESIGN.md` (look) → **this file** (screens, keys, SDLC, rollout).  
**Do not implement from the current screenshot.** The live hub is the *from*; this is the *to*.

Related: `PLAN.md` Phase 2 (split `console.tsx`, no extra pages).

---

## 1. What this product is in the TUI

PerezDev Hub is an **AI SDLC workbench** in the terminal:

| SDLC step | Page | User job |
| --- | --- | --- |
| **Run** | Chat | Talk to the local/cloud model. Diagnose, autofix, ask. |
| **Build** | Skills | Describe an agent → generate skill files → install into tools. |
| **Connect** | MCP | Pick or discover servers → install into the same tools. |
| **Review** | Overlay, not a tab | Confirm writes (`Y`/`N` + diff). `doctor` stays CLI / `/` later. |

Three tabs plus **News**. Review is a dialog.

---

## 2. Primary user action

**Type a prompt and get an answer.** Everything else is one Shift-arrow away.

If a new user cannot do that without reading chrome, the redesign failed.

---

## 3. Design direction (locked)

- **Color:** Restrained. Cyan = focus. Violet = generate/plan. Green/amber/rose = status.
- **Scene:** A developer, late, one terminal, project already open. They want the model, not a tour of IDEs they do not use.
- **Anchors:** lazygit (few panes, obvious focus), Claude Code CLI (prompt-first), k9s (list + action, not a dashboard).
- **Anti:** htop-everything-visible, fake boot checklists, emoji tabs, model name in three places.

---

## 4. Information architecture

```
perezdev
 ├─ Intro (optional, must vanish)
 └─ Hub shell
      ├─ Header     brand · Chat | Skills | MCP | News · model
      ├─ Main       exactly one page
      └─ Footer     prompt (Chat/Skills compose) + mode/autonomy/? 
```

**Remove from default Chat chrome**

- Left ENVIRONMENT rail (IDES / CLIS / PROJECT / ROUTING)
- Duplicate `CHAT ENGINE` title
- Boot lines in the transcript (`Connecting…`, `Type a prompt or /help…`)
- Header hint `⇄ Shift ←/→`
- Second shortcut legend under the prompt (keep one empty-state line only)
- Duplicate model chip in the status bar if it is already in the header

**Where those facts go**

| Fact | Home |
| --- | --- |
| Brand + version | Header left |
| Current page | Active tab |
| Model + online | Header right |
| Detected stack | Skills page “targets” / `?` / `/list` — not Chat |
| Present tools | Skills targets; MCP “installed on”; never a full empty catalog |
| Routing (normal vs planning) | Footer mode word `NORMAL` / `PLANNING` |
| Autonomy / thinking | Footer, compact: `manual · med` |
| Full keymap | `?` only |
| Slash catalog | `?` + `/` autocomplete |

---

## 5. Target frames (character cells)

Width cap stays **132**. Below **116** cols, Skills/MCP stack (already true). Below **80**, still usable: header wraps or truncates model, main still fills.

### 5.1 Chat (default)

```
┌ PEREZDEV HUB  v0.2.0     [ Chat ]  Skills   MCP           ● llama3:latest ┐
│                                                                            │
│  you                                                                       │
│  hello                                                                     │
│                                                                            │
│  llama3                                                                    │
│  Hello — what do you want to work on in this repo?                         │
│                                                                            │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│ › ask or /command                                                          │
│   NORMAL · manual · med · ?                                                │
└────────────────────────────────────────────────────────────────────────────┘
```

Empty first visit (no messages yet):

```
│                                                                            │
│  Ask anything about this repo.                                             │
│  Shift+← / Shift+→  Skills and MCP ·  ?  keys                              │
│                                                                            │
```

That empty copy shows **once**. After the first send, it never returns (except `/clear` → short empty, no tutorial).

### 5.2 Skills

```
┌ PEREZDEV HUB  v0.2.0      Chat  [ Skills ]  MCP           ● llama3:latest ┐
│  Describe the agent                                                        │
│ ┌──────────────────────────────────────────┐                               │
│ │ › frontend reviewer who checks a11y      │                               │
│ └──────────────────────────────────────────┘                               │
│  Install into  ● cursor  ● claude-code  ○ copilot     (space to toggle)    │
│                     [ Generate ]                                           │
│  ─ preview ────────────────────────────────                                │
│  # Skill: frontend-reviewer                                                │
│  …                                                                         │
│ › …                                                                        │
│   NORMAL · manual · med · ?                                                │
└────────────────────────────────────────────────────────────────────────────┘
```

No generation presets on first paint (`auto` is default). Presets live behind `Tab` to a compact row or stay CLI flags. **One primary action:** Generate.

### 5.3 MCP

```
┌ PEREZDEV HUB  v0.2.0      Chat   Skills  [ MCP ]          ● llama3:latest ┐
│  › Local Filesystem                              files      install        │
│    SQLite Database                               db         installed      │
│    …                                                                       │
│  [ Discover from repo ]                                                    │
│  › custom server…                                                          │
│   NORMAL · manual · med · ?                                                │
└────────────────────────────────────────────────────────────────────────────┘
```

Right-hand JSON panel only **after** discover or generate, or when width ≥ 116. Empty right pane is omitted (no “context” placeholder).

### 5.4 Review (all pages)

Confirm replaces the lower third or sits above the prompt — same `ConfirmBox` behavior. Copy: **Write these files?** not `MANUAL CONFIRMATION REQUIRED`.

### 5.5 Intro

- Any key / Enter skips immediately.
- If animation stays: typewriter logo **or** a 1-line real status after `detectOllama` + `loadHome`, not four fake steps.
- **Must not remain in scrollback.** Enter alt screen on intro+hub, or `clear` before Console mount.
- Tests / `PDH_NO_INTRO` / non-TTY: skip (already true).

---

## 6. Navigation (learn once)

| Key | Action | When |
| --- | --- | --- |
| `Shift+←` `Shift+→` | Previous / next page | Always, including while typing |
| `Esc` | Close overlay → else Chat | Always |
| `?` | Help | When not typing a `?` into the field — **or** only with empty prompt / `Ctrl+?`. Prefer: `?` on empty prompt, `/help` when typing |
| `/` | Slash menu | Chat, prompt empty or starts with `/` |
| `Shift+Tab` | Normal ↔ Planning | Always |
| `Ctrl+M` | Model picker | Always |
| `Ctrl+A` | Manual ↔ Auto | Always |
| `Ctrl+T` | Thinking cycle | Always |
| `Enter` | Send / activate | Focused field |
| `Y` / `N` | Confirm | Only while confirm is open |
| `F1` `F2` `F3` | Pages | Legacy; keep, do not advertise |

**Do not** tell Chat users to press `1` `2` `3`. Those keys type. If we want jump keys while typing, add `Ctrl+1/2/3` in a later slice — not in v1 of this redesign.

---

## 7. Chat content rules

1. Transcript = user + model (+ errors). No “how to use the app” lines in the log.
2. Mount: detect in the background; header pill updates; **do not** `push("Connecting…")`.
3. Offline: one banner above the prompt (existing warn box), not a log novel.
4. Slash `/build` `/mcp` stay for power users; they must not be the way we explain pages 2 and 3.
5. Streaming: spinner + partial on the last model line, not a second status region.

---

## 8. Detection honesty

- Rail catalog of all IDEs is gone from Chat.
- `present` means “we found config **or** we are running inside that host.” Cursor open on this repo counts even without `.cursor/rules`.
- Skills “Install into” lists **detected + currently selected**, not five empty circles as the hero.
- Aider remains detect-only (README): show in Skills only if present, never as a failed install target.

---

## 9. States

| State | User sees | Feels |
| --- | --- | --- |
| First open, Ollama up | Empty Chat + one hint line, model pill on | Ready |
| First open, no model | Same layout, muted pill, offline banner with one command | Blocked but clear |
| Streaming | Last line grows, spinner | Alive |
| Confirm | Diff + Y/N | Safe |
| Help | Overlay, esc | Oriented |
| Skills empty preview | Form only, no fake markdown | Calm |
| MCP none installed | List of installable names, no “empty context” panel | Choosable |
| Narrow terminal | Stacked Skills/MCP, header truncates model | Still usable |
| Busy | Ignore extra submits; keep Esc | In control |

---

## 10. Copy (canonical)

- Tabs: `Chat` `Skills` `MCP`
- Empty Chat: `Ask anything about this repo.`
- Hint: `Shift+← / Shift+→  Skills and MCP ·  ?  keys`
- Prompt placeholder: `ask or /command`
- Confirm: `Write these files?`
- Offline: `No model. ollama pull llama3  or set ANTHROPIC_API_KEY.`
- Help footer: `esc to close`

No emoji in UI chrome. Log glyphs stay `› ✔ ✘ ●`.

---

## 11. Implementation order (do in this order)

Matches distill: subtract first, then honesty, then pages.

| Slice | Change | Done when |
| --- | --- | --- |
| **A** | Alt-screen or clear after intro; drop fake boot steps | Screenshot is one frame, not intro+hub |
| **B** | Chat: no rail, no page title, no boot `push`s, one hint when empty | Transcript is only the conversation |
| **C** | Header: tabs + one model; footer: mode · autonomy · thinking · `?` | Model appears once |
| **D** | Detection: present-only; Cursor-as-host | No five empty IDE dots on Chat |
| **E** | Skills: one field, default auto, Generate primary; presets demoted | First Skills action is obvious |
| **F** | MCP: omit empty side panel; Discover secondary | List is the page |
| **G** | Copy + `?` keymap updated to match | README Keys table matches TUI — done |

Keep behavior: confirm+diff, slash registry, model picker, `Shift+←/→`, tests for overlay and confirm.

**Out of scope for this redesign:** new pages, new slash commands, starter profiles (PLAN Phase 3), animations beyond removing fake boot.

---

## 12. Files likely to change

- `src/tui/intro.tsx` — real status or delete checklist; clear handoff
- `src/tui/app.tsx` — alt screen / clear
- `src/tui/shell.tsx` — header; no rail slot
- `src/tui/nav.ts` — Shift-arrows / F1–F3 / empty-`?` help
- `src/tui/statusbar.tsx` — no model duplicate
- `src/tui/pages/chat.tsx` — transcript + empty state
- `src/tui/console.tsx` — stop tutorial `push`s; nav copy
- `src/tui/help.tsx` — match §6
- `src/tui/pages/factory.tsx` / `mcp.tsx` — §5.2–5.3
- `src/core/ecosystem.ts` — host vs config presence
- `README.md` — Keys + ASCII mock once shipped

---

## 13. Acceptance (redesign done)

1. A 80×24 screenshot of Chat after `hello` shows: header, transcript, prompt, one footer line. No intro remnant. No left IDE list.
2. New user can reach Skills and MCP without reading README (hint or `?` only).
3. `1` typed in Chat inserts `1`. Pages still move with Shift-arrows.
4. Writes still require `Y` in manual mode with a diff.
5. Existing vitest TUI tests updated; no regression on confirm / help / slash.

---

## 14. Open decisions (defaults if we do not revisit)

- **Intro:** keep a **short** skippable logo, no checklist. (Override: delete intro entirely.)
- **`?` vs typing:** empty prompt: `?` opens help; non-empty: `?` is a character. `/help` always works.
- **Rail:** gone. Not brought back unless a user setting `rail: true` is requested later.
