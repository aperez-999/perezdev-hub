---
name: PerezDev Hub
description: Local-first AI SDLC workbench in the terminal
colors:
  cyan: "#34d8e6"
  cyan-bright: "#7fe9f2"
  violet: "#b89dff"
  ok: "#46d18a"
  warn: "#f1c453"
  bad: "#fb7185"
  fg: "#cdd6e0"
  fg2: "#8b97a6"
  muted: "#6e7b8a"
  dim: "#4d5866"
  faint: "#3a4450"
  line: "#1b2530"
  panel: "#0a0f16"
  ink: "#04161a"
typography:
  display:
    fontFamily: "terminal monospace"
    fontSize: "1 cell"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "normal"
  title:
    fontFamily: "terminal monospace"
    fontSize: "1 cell"
    fontWeight: 700
    lineHeight: 1
  body:
    fontFamily: "terminal monospace"
    fontSize: "1 cell"
    fontWeight: 400
    lineHeight: 1
  label:
    fontFamily: "terminal monospace"
    fontSize: "1 cell"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
rounded:
  none: "0"
  round: "ink-border-round"
spacing:
  0: "0 cells"
  1: "1 cell"
  2: "2 cells"
components:
  tab-active:
    backgroundColor: "{colors.cyan}"
    textColor: "{colors.ink}"
    padding: "1 cell"
  tab-idle:
    textColor: "{colors.muted}"
    padding: "1 cell"
  prompt-focused:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fg}"
  status-ok:
    textColor: "{colors.ok}"
  status-warn:
    textColor: "{colors.warn}"
  status-bad:
    textColor: "{colors.bad}"
---

# Design System: PerezDev Hub

## 1. Overview

**Creative North Star: "The Workbench"**

This is a bench, not a cockpit. One surface for running a model, building skills, and connecting tools. Density is allowed only where the task is a list (MCP directory, skill preview). Chat is sparse on purpose.

The system is **restrained**: cyan for “you are here / type here,” violet for generative/planning, green/amber/rose for status. Neutrals do the rest. Accent occupies well under 10% of any frame.

It rejects fake boot rituals, catalog sidebars of absent IDEs, emoji navigation, and repeating the model name in three places.

**Key Characteristics:**

- Character-cell layout (Ink). Borders are `round` or `single`, never stacked boxes that eat rows.
- One identity in the header. One model indicator. One prompt.
- Motion is state only: spinner while streaming, blink only on “press Enter” if intro remains.
- Logo gradient (`#34d8e6` → `#b89dff`) is **intro-only**. The hub itself is flat cyan + violet, no gradient text.

## 2. Colors

Terminal truecolor tokens from `src/tui/theme.ts`. Hex in frontmatter is normative.

### Primary

- **Signal Cyan** (`#34d8e6`): active tab fill, focused prompt border, primary glyph (`›`). The only “you are here” color.

### Secondary

- **Planning Violet** (`#b89dff`): AI / generate / plan mode. Model name when it is the subject. Skill Builder generate action. Never for idle chrome.

### Tertiary

- Omit a third brand hue. Status colors are semantic, not brand.

### Neutral

- **Body** (`#cdd6e0`): readable copy, transcript, labels the user must read.
- **Secondary** (`#8b97a6`): supporting sentences, AI body if not emphasized.
- **Muted** (`#6e7b8a`): idle tabs, inactive tool names.
- **Dim** (`#4d5866`): hints only (`? help`), never body.
- **Faint** (`#3a4450`): empty dots, unused marks.
- **Line** (`#1b2530`): borders.
- **Ink** (`#04161a`): text on cyan or violet fill.

### Status

- **Ok** (`#46d18a`): present, installed, success.
- **Warn** (`#f1c453`): confirm, offline, needs action.
- **Bad** (`#fb7185`): error, cancel.

**The Ten-Percent Rule.** Cyan and violet together occupy ≤10% of the frame. If a screen looks “lit up,” remove fills until only the active tab and the focused field glow.

**The One-Home Rule.** The model string appears in the header **or** the status bar, never both. Brand appears in the header only.

## 3. Typography

**Display Font:** the user’s terminal monospace  
**Body Font:** same  
**Label/Mono Font:** same

**Character:** One family, two weights (regular / bold). Hierarchy is color and weight, never size — terminals do not scale type.

### Hierarchy

- **Display** (bold): wordmark `PEREZDEV HUB` in the header only. No subtitle under it in the hub.
- **Title** (bold, `fg2`): page titles only if the tab is not visible; prefer dropping the page title when tabs exist.
- **Body** (regular, `fg`): user messages, errors the user must act on.
- **Label** (regular, `muted` or `dim`): section names if needed; prefer no all-caps eyebrows on every pane.

**The No-Eyebrow Rule.** Do not prefix every region with tracked uppercase (`ENVIRONMENT`, `ROUTING`, `CHAT ENGINE`) unless the pane has no other title. Tabs already name the page.

## 4. Elevation

No shadows. Depth is **one focused border** (`theme.accent`) vs idle (`theme.line`). Overlays (help, model picker, confirm) replace the main pane; they do not dim-and-float (terminals cannot).

**The Flat-Hub Rule.** Intro may use a round-bordered logo box. The hub uses a single header rule, a main region, and a prompt/status row. No nested round cards around the transcript.

## 5. Components

### Header

- Left: `PEREZDEV HUB` + muted `vX.Y.Z`
- Center: tabs — Chat, Skills, MCP, News. Active = cyan fill + ink text. Idle = muted.
- Right: one model pill — `● llama3:latest` (ok if local, muted if offline). No “local” word if the dot already means local.
- No Shift-arrow hint in the header. That lives in `?` and the empty-prompt line.

### Tabs

- Labels: **Chat**, **Skills**, **MCP**, **News**.
- Switching: `Shift+←` / `Shift+→` always, including while typing. Optional `Ctrl+1/2/3` later if digits stay reserved for the prompt.

### Prompt

- One round-border field at the bottom of Chat (and the compose field on Skills).
- Glyph `›` in cyan (normal) or violet (plan).
- Placeholder only when empty: `ask or /command`
- Focused border cyan; idle border line.

### Transcript (Chat)

- User: `you` in violet on its own line, then text in `fg`.
- Model: short model name in cyan on its own line, then text in `fg`.
- System/ok/err: `✔` / `✘` / `●` plus `fg2`. Do not mix boot tutorials into this list.

### Confirm

- Warn border, title `Write these files?`, diff lines, `[Y] Approve  [N] Cancel`. Inline, not a second window.

### Lists (MCP / tools)

- Selected: `›` + accent name.
- Installed: `●` ok. Not installed: `○` faint — **only for items in this list**, not a global catalog of IDEs.

### Help overlay

- Replaces main. Two columns: keys, slash commands. `esc` closes. This is the full keymap.

### Intro

- Optional, skippable, ≤ ~2s of real work or skip with any key.
- If kept: logo, then **one** line of truth (“Ollama up · 1 model”) after real detect — not a four-step fake checklist.
- Must clear or use an alternate screen so it does not remain in scrollback.

## 6. Do's and Don'ts

### Do:

- **Do** put the conversation (or the Skills form, or the MCP list) in the largest remaining rectangle after header + prompt.
- **Do** show only tools that are present; collapse the rest into help or a Skills “targets” picker.
- **Do** keep Manual confirm for writes; show the diff once, in the confirm box.
- **Do** use cyan for focus and violet for generate/plan.
- **Do** make `?` complete and on-screen chrome incomplete on purpose.

### Don't:

- **Don't** list every unsupported tool as an empty circle.
- **Don't** run a fake NASA boot sequence that pretends to scan.
- **Don't** repeat brand, model, or nav hints on three surfaces.
- **Don't** use emoji in tabs, headers, or log glyphs (status uses `● ○ ✔ ✘ ›` only).
- **Don't** use border-left color bars, gradient text in the hub, or glass panels.
- **Don't** advertise `1` `2` `3` as page keys on Chat (those keys type into the prompt).
- **Don't** add a fifth hub tab for setup; first-run is an overlay, then one empty-state line.
