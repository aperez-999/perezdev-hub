# PerezDev Hub — TUI Redesign: Implementation Guide

This package contains a **clickable HTML prototype** of a redesigned PerezDev Hub
terminal UI, plus this guide for porting it into the real **Ink (React-for-the-terminal)**
TUI in `src/tui/`.

The prototype is a faithful *visual + interaction spec*. It is HTML so you can click
through it; the real app is a character-grid terminal, so **every click becomes a
keypress** and **every pixel becomes a character cell**. This guide does that translation
for you, file by file, grounded in the existing codebase.

> Read this top to bottom once, then work the **§13 task checklist**. Each task names the
> file(s) to touch and a verification step.

---

## 1. What's in this package

```
perezdev-hub-redesign/
├─ prototype.html          # open in any browser — the full interactive spec
├─ IMPLEMENTATION.md       # this file
└─ screenshots/            # chat.png · skill-builder.png · mcp-manager.png
```

Open `prototype.html` and drive it:
- Click tabs **F1 / F2 / F3** (or press `1` `2` `3`, `F1`–`F3`).
- F1: type `/` to open the **slash-command autocomplete**; type a prompt and press Enter to see streaming.
- F2: type a goal, toggle target tools, press **Generate** → watch the `SKILL.md` stream → approve the **diff dialog**.
- F3: **Run Discovery Scanner**, or type a custom integration to compile `mcpServers` JSON.
- Bottom status bar: click **mode / autonomy / thinking** to cycle; the `?` opens the help overlay.
- The Tweaks panel exposes `colorScheme`, `crtScanlines`, `providerOnline` — those are *prototype-only* knobs, not features to build.

---

## 2. Design goals (why this redesign exists)

The current TUI (`src/tui/shell.tsx`) is an **80-column box, single cyan accent**, with all
content stacked vertically inside one column. `PLAN.md` Phase 2 already calls for a "Terminal
UI overhaul — less clustered, animated where it helps, no template feel." This redesign delivers:

1. **Full-width, three-zone shell** — header · persistent **environment rail** · **status bar**.
   Stop cramming everything into one 80-col column; use the terminal's real width.
2. **Persistent left rail** — IDE/CLI/Ollama detection + project signals + model routing are
   **always visible**, not buried in the chat scroll. (Today they live inside `ChatPage` only.)
3. **Two-accent palette** — cyan (primary/links) + violet (AI/generative). Today `theme.ts`
   has only `accent: cyan`.
4. **Richer pages** — slash autocomplete, category-colored log, a Skill Builder with a **live
   `SKILL.md` preview + diff-before-write**, and an MCP page with a **repo-aware scanner** and
   **compiled-JSON** panel.
5. **A `?` help overlay** and **diff inside the confirm dialog** (both are open Phase-2 items).

Nothing here changes the *data layer* (`src/core/*`, `src/adapters/*`, `src/registry/*`). It is
a **view + interaction** rework of `src/tui/*`.

---

## 3. HTML → Ink translation cheat sheet

The prototype is CSS flexbox; Ink is **Yoga flexbox over a character grid**. Map it like this:

| Prototype (CSS/HTML)                | Ink equivalent                                                   |
| ----------------------------------- | ---------------------------------------------------------------- |
| `<div style="display:flex">`        | `<Box flexDirection="row">`                                      |
| `flex-direction:column`             | `<Box flexDirection="column">`                                   |
| `flex:1`                            | `<Box flexGrow={1}>`                                             |
| `width:236px` (a sidebar)           | `<Box width={28}>` — **columns, not px** (≈ px/8.5)              |
| `gap:8px`                           | `<Box gap={1}>` (Ink ≥ 4 supports `gap`) or spacer `<Box> </Box>`|
| `padding:11px 18px`                 | `<Box paddingY={1} paddingX={2}>`                                |
| `border:1px solid #1b2530;radius`   | `<Box borderStyle="round" borderColor="#1b2530">`               |
| `color:#34d8e6`                     | `<Text color="#34d8e6">` (Ink v5 accepts hex)                    |
| `background:#34d8e6;color:#04161a`  | `<Text backgroundColor="#34d8e6" color="#04161a">` (the "active tab"/"chip" look) |
| `font-weight:700`                   | `<Text bold>`                                                    |
| dim gray text                       | `<Text dimColor>` or `color="#566270"`                           |
| gradient wordmark                   | `ink-gradient` `<Gradient colors={['#34d8e6','#b89dff']}>` (already a dep) |
| **`onClick`**                       | **`useInput` keyboard handler** — see §7. There are no clicks.   |
| popover / overlay                   | conditionally render a `<Box>` that **replaces or sits above** content (terminals can't float; see §11) |
| CSS animation / spinner             | `ink-spinner` `<Spinner type="dots" />` (already used)           |
| ellipsis truncation                 | manual: `str.length > n ? '…'+str.slice(-n) : str`               |

**Hex color support:** Ink v5 + the `chalk` it bundles render 24-bit color in truecolor terminals
and degrade gracefully elsewhere. Keep the hex tokens; don't downgrade to the 8 ANSI names.

**Width:** read the real terminal width instead of hardcoding 80:
```tsx
import { useStdout } from "ink";
const { stdout } = useStdout();
const cols = Math.min(stdout.columns ?? 120, 132); // cap so it doesn't sprawl on ultrawide
```

---

## 4. Component architecture (target)

Keep it aligned with the `PLAN.md` Phase-2 split. New/changed files:

```
src/tui/
├─ theme.ts            (EXTEND — add violet, ok/warn/bad hex, neutrals, layout consts)
├─ shell.tsx           (REWRITE — 3-zone shell: Header, body row, StatusBar)
├─ components.tsx      (EXTEND — Row gets `cat`, ConfirmBox gets diff, new SectionHeader sizes)
├─ rail.tsx            (NEW — <EnvRail/>: IDE/CLI/Ollama + project + routing)
├─ statusbar.tsx       (NEW — <StatusBar/>: model · mode · autonomy · thinking · keys)
├─ help.tsx            (NEW — <HelpOverlay/>: keys + slash table, toggled by `?`)
├─ slash.tsx           (NEW — <SlashMenu/>: filtered command list above the chat input)
├─ pages/
│  ├─ chat.tsx         (REWRITE — header strip, category log, slash menu, offline banner)
│  ├─ factory.tsx      (REWRITE — compose form + live SKILL.md preview pane)
│  └─ mcp.tsx          (REWRITE — directory + scanner panel + compiled-JSON panel)
├─ commands.ts         (NEW per PLAN — { name → {handler, help} } registry; feeds /help + SlashMenu)
├─ use-hub-actions.ts  (NEW per PLAN — build/install/mcp/scan wiring, extracted from console.tsx)
└─ console.tsx         (SLIM — owns state (useReducer), wires keys, renders Shell + active page)
```

If you don't want the full Phase-2 refactor yet, you can land the **view** changes (theme,
shell, rail, statusbar, help, slash, pages) without `commands.ts`/`use-hub-actions.ts` — but the
slash menu and `/help` should still read from **one command list** so they can't drift.

---

## 5. Design tokens → `src/tui/theme.ts`

Replace the tiny current theme with a two-accent palette + layout constants. Keep the existing
key names (`accent`, `ok`, `warn`, `bad`, `muted`) so current usages keep working; add the rest.

```ts
// src/tui/theme.ts
export const theme = {
  // accents
  accent:       "#34d8e6", // cyan — primary, links, active tab, prompt glyph
  accentBright: "#7fe9f2",
  violet:       "#b89dff", // AI / generative / planning
  // status
  ok:   "#46d18a",
  warn: "#f1c453",
  bad:  "#fb7185",
  // neutrals (dark terminal)
  fg:     "#cdd6e0", // body text
  fg2:    "#8b97a6", // secondary
  muted:  "#6e7b8a", // labels / inactive
  dim:    "#4d5866", // eyebrows / hints
  faint:  "#3a4450", // empty dots, rules
  line:   "#1b2530", // borders / dividers
  panel:  "#0a0f16", // inset card bg
} as const;

// Logo gradient — pass to <Gradient colors={LOGO_GRADIENT}>
export const LOGO_GRADIENT = ["#34d8e6", "#7c8cff", "#b89dff"];

// Layout (character cells)
export const RAIL_W = 28;       // left environment rail
export const BUILDER_FORM_W = 46; // F2 compose column
export const MCP_PANEL_W = 40;  // F3 right panel
```

**Eyebrow/label style** (used everywhere — `ENVIRONMENT`, `GOAL`, `TARGET TOOLS`): ALL-CAPS,
`dimColor`, one space between letters is *not* needed — Ink can't letter-space, so just rely on
the caps + dim color. Render as `<Text color={theme.dim}>ENVIRONMENT</Text>`.

**Accent bar headings** (the `▌ CHAT ENGINE` motif): keep `SectionHeader` but standardize:
```tsx
export function SectionHeader({ label, color = theme.accent }) {
  return <Text><Text color={color}>▌ </Text><Text bold color={theme.fg2}>{label.toUpperCase()}</Text></Text>;
}
```

---

## 6. The three-zone shell → `src/tui/shell.tsx`

Rewrite `Shell` from a single bordered column into header / body-row / status-bar. The body row
is `flexDirection="row"`: a fixed-width **rail** + a `flexGrow` **main** area (the active page).

```tsx
import React from "react";
import { Box, Text, useStdout } from "ink";
import Gradient from "ink-gradient";
import { theme, LOGO_GRADIENT, RAIL_W } from "./theme.js";
import { EnvRail } from "./rail.js";
import { StatusBar } from "./statusbar.js";

export type Page = 1 | 2 | 3;
const TABS = [
  { page: 1 as Page, key: "F1", label: "Chat Engine" },
  { page: 2 as Page, key: "F2", label: "Skill Builder" },
  { page: 3 as Page, key: "F3", label: "MCP Manager" },
];

export function Shell({ page, home, footer, children }: {
  page: Page; home: HomeData | null; footer: StatusProps; children: React.ReactNode;
}) {
  const { stdout } = useStdout();
  const cols = Math.min(stdout?.columns ?? 120, 132);
  const rows = Math.min(stdout?.rows ?? 40, 44);

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      {/* ── header ── */}
      <Box paddingX={2} paddingY={0} borderStyle="round" borderColor={theme.line} flexDirection="column">
        <Box>
          <Box flexGrow={0}>
            <Text color={theme.accent}>◤ </Text>
            <Gradient colors={LOGO_GRADIENT}><Text bold>PEREZDEV HUB</Text></Gradient>
            <Text color={theme.muted}>  v{VERSION /* §15: read from package.json */}</Text>
          </Box>
          <Box flexGrow={1} justifyContent="center">
            {TABS.map((t, i) => {
              const on = page === t.page;
              return (
                <Box key={t.page} marginLeft={i ? 1 : 0}>
                  {on
                    ? <Text backgroundColor={theme.accent} color="#04161a" bold>{` ${t.key} ${t.label} `}</Text>
                    : <Text color={theme.muted}>{` ${t.key} ${t.label} `}</Text>}
                </Box>
              );
            })}
          </Box>
          <Box flexGrow={0}>
            <Text color={home?.online ? theme.ok : theme.muted}>● </Text>
            <Text color={theme.fg2}>{home?.online ? "local " : "offline "}</Text>
            <Text color={theme.violet} bold>{footer.model}</Text>
          </Box>
        </Box>
      </Box>

      {/* ── body: rail + main ── */}
      <Box flexGrow={1}>
        <Box width={RAIL_W} flexShrink={0}><EnvRail home={home} footer={footer} /></Box>
        <Box flexGrow={1} flexDirection="column">{children}</Box>
      </Box>

      {/* ── status bar ── */}
      <StatusBar {...footer} />
    </Box>
  );
}
```

> **Ink note:** you can't put a rounded border *and* fill the full height cleanly on every
> terminal; prefer one outer border (or none) and use single-line dividers (`─`.repeat / a
> bordered `Box`) between zones. Test in an 120×40 terminal; that's the design target.

---

## 7. Keyboard model (replaces every click) → `console.tsx`

There is **no mouse**. Use one `useInput` in `console.tsx` for global keys, and per-page focus
state for navigation. The prototype's clickable things become:

| Prototype click            | Terminal key                                             |
| -------------------------- | -------------------------------------------------------- |
| Tab F1/F2/F3               | `F1`/`F2`/`F3`, or `1`/`2`/`3` when not typing            |
| model pill → menu          | `Ctrl+M` toggles a selectable model list (arrows + Enter) |
| mode / autonomy / thinking | `Shift+Tab` (mode), `Ctrl+A` (autonomy), `Ctrl+T` (thinking) |
| `?` help                   | `?` when not typing                                       |
| target-tool chips (F2)     | `Tab` cycles focus to chips; `Space` toggles the focused chip |
| Generate button (F2)       | `Enter` in the goal field, or focus button + `Enter`     |
| directory rows (F3)        | `↑`/`↓` select, `Enter`/`i` install the selected server  |
| Run Scanner (F3)           | `s`, or focus the button + `Enter`                       |
| confirm `[Y]/[N]`          | `y` / `n` (already implemented)                           |
| close overlay              | `Esc`                                                     |

```tsx
useInput((input, key) => {
  if (help) { if (key.escape) setHelp(false); return; }
  if (key.escape) { closeOverlays(); return; }
  if (key.f1) return setPage(1);
  if (key.f2) return setPage(2);
  if (key.f3) return setPage(3);
  if (key.ctrl && input === "a") return cycleAutonomy();
  if (key.ctrl && input === "t") return cycleThinking();
  if (key.shift && key.tab) return cycleMode();
  if (!typing) {                       // typing = a TextInput is focused
    if (input === "1") setPage(1);
    else if (input === "2") setPage(2);
    else if (input === "3") setPage(3);
    else if (input === "?") setHelp(true);
  }
});
```

`ink-text-input`'s `focus` prop gates which field receives characters — only one field should
have `focus` at a time, and global single-letter shortcuts must be ignored while a field is
focused (track a `typing`/`inputActive` boolean, as the current code already does).

---

## 8. F1 Chat Engine → `src/tui/pages/chat.tsx`

Today everything (badges + log + input) is one column inside `ChatPage`. New layout: a thin
**header strip**, the **scrolling category log**, an optional **offline banner** and **slash
menu**, then the **input capsule**. Badges move OUT to the rail (§9).

### 8a. Category-colored log
`Row` already styles by `kind`. Add the `cat` field `PLAN.md` asks for so log lines can be
filtered (e.g. F3 staging shows only `cat:"mcp"`), and keep the gutter glyphs from the prototype:

```ts
// components.tsx
export type LogKind = "info" | "ok" | "err" | "user" | "ai";
export interface LogLine { kind: LogKind; text: string; cat?: "chat" | "mcp" | "build" | "fix"; }

export function Row({ line }: { line: LogLine }) {
  const g = {
    user: ["›", theme.violet],  ai:  ["", theme.fg],
    ok:   ["✔", theme.ok],      err: ["✘", theme.bad],
    info: ["●", theme.accent],
  }[line.kind] as [string, string];
  return (
    <Box>
      <Box width={2} flexShrink={0}><Text color={g[1]}>{g[0]}</Text></Box>
      <Text color={line.kind === "user" ? theme.fg : theme.fg2}
            bold={line.kind === "user"} wrap="wrap">{line.text}</Text>
    </Box>
  );
}
```

Cap the visible log to the available rows (the current code already does `log.slice(-11)`); make
the count derive from terminal height instead of a magic `11`.

### 8b. Streaming
Already present (`busy` + `partial` + `<Spinner>`). Keep it; render the streaming line with the
same dim style and a trailing block caret is unnecessary in a terminal (the cursor does it).

### 8c. Offline banner
When no provider is reachable (`!home.online` / no Ollama and no key), render a warn-bordered Box
above the input:
```tsx
{!online && (
  <Box borderStyle="round" borderColor={theme.warn} paddingX={1} marginX={2}>
    <Text color={theme.warn}>⚠ No local model. Run </Text>
    <Text color={theme.warn} bold>ollama pull qwen2.5-coder</Text>
    <Text color={theme.warn}> or set ANTHROPIC_API_KEY.</Text>
  </Box>
)}
```

### 8d. Slash autocomplete → `src/tui/slash.tsx`
When the chat input starts with `/`, render a filtered command list **above** the input
(terminals can't overlay, so it occupies rows directly above the capsule). Drive it from the
command registry so it never drifts from `/help`.

```tsx
export function SlashMenu({ query, sel }: { query: string; sel: number }) {
  const items = COMMANDS.filter(c => c.name.startsWith(query.toLowerCase()) || query === "/");
  if (!items.length) return null;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.line} paddingX={1} marginX={2}>
      {items.slice(0, 8).map((c, i) => (
        <Box key={c.name}>
          <Box width={22} flexShrink={0}>
            <Text color={i === sel ? theme.accent : theme.fg2} bold={i === sel}>{c.usage}</Text>
          </Box>
          <Text color={theme.muted}>{c.help}</Text>
        </Box>
      ))}
    </Box>
  );
}
```

Wire in `console.tsx`: on each `onChange`, set `slashOpen = value.trimStart().startsWith("/")`,
reset `sel = 0`. While `slashOpen`, intercept `↑`/`↓` to move `sel`, `Tab` to complete to
`items[sel].name + " "`, and `Enter` either runs the selected command or submits the typed line.
The command list (`COMMANDS`) lives in `commands.ts` — see the prototype's `SLASH` array for the
exact 13 commands and help strings (they match `README.md`).

### 8e. The input capsule
Keep `ink-text-input`. Prompt glyph is `plan ›` (violet) in planning mode, else `›` (cyan), as in
the prototype. Border turns `accent` when the slash menu is open or the field is focused.

---

## 9. Environment rail → `src/tui/rail.tsx` (NEW)

This is the biggest structural win: the detection badges that today live inside `ChatPage`
(`Badges` in `components.tsx`) move into a **persistent left rail** rendered by `Shell` on every
page. It reads the **real** ecosystem scan — do not hardcode. Source data already exists:
`home.ecosystem` (from `src/core/ecosystem.ts` → `scanEcosystem()`), `home.scan.signals`
(project signals), and the routing models.

```tsx
export function EnvRail({ home, footer }: { home: HomeData | null; footer: StatusProps }) {
  const eco = home?.ecosystem ?? [];
  const ide = eco.filter(t => t.kind === "ide");
  const cli = eco.filter(t => t.kind === "cli");
  const dot = (on: boolean) => on ? <Text color={theme.ok}>●</Text> : <Text color={theme.faint}>○</Text>;
  const row = (t: EcoTool) => (
    <Box key={t.id}><Box width={2}>{dot(t.present)}</Box><Text color={t.present ? theme.fg : theme.muted}>{t.label}</Text></Box>
  );
  return (
    <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor={theme.line}
         borderTop={false} borderBottom={false} borderLeft={false}>
      <Text color={theme.dim}>ENVIRONMENT</Text>
      <Text color={theme.faint}>IDES</Text>
      {ide.map(row)}
      <Text color={theme.faint}>CLIS</Text>
      {cli.map(row)}
      {/* ollama appended from OllamaStatus, accent dot */}
      <Box marginTop={1}/>
      <Text color={theme.dim}>PROJECT</Text>
      <Text color={theme.fg2} wrap="wrap">{(home?.scan.signals ?? []).join(" · ") || "—"}</Text>
      <Box marginTop={1}/>
      <Text color={theme.dim}>ROUTING</Text>
      <Box justifyContent="space-between"><Text color={theme.muted}>normal</Text><Text color={theme.accent}>qwen2.5-coder</Text></Box>
      <Box justifyContent="space-between"><Text color={theme.muted}>planning</Text><Text color={theme.violet}>deepseek-r1</Text></Box>
    </Box>
  );
}
```

> The routing model names should come from your provider config, not literals — wire them to
> wherever Normal/Planning model selection is resolved (`resolveProvider` per `PLAN.md`).

---

## 10. F2 Skill Builder → `src/tui/pages/factory.tsx`

Replace the 3-item arrow list (`FACTORY_ITEMS`) with a **two-pane** layout: a left **compose**
column and a right **live `SKILL.md` preview**. The generation/install plumbing already exists in
`data.ts` (`installDescribed(name, purpose, targets, bodyOverride?)` and `expandPurpose`); you are
only changing the UI around it.

**Left column (width `BUILDER_FORM_W`):**
1. `GOAL` — an `ink-text-input` (the `purpose`).
2. `TARGET TOOLS` — chips for each writable tool. Use `home.targets` / detected tools. A chip is
   `<Text>` with a `●`(on)/`○`(off) prefix; the focused chip is bold/accent. `Space` toggles.
   This replaces the implicit "all targets" behavior with explicit selection (honors
   `.perezdevrc default_targets` precedence — flag → rc → detected → all).
3. `GENERATION` — preset chips `auto / strict / minimal` (maps to your metaprompt strictness).
4. `Generate & Install` — on `Enter`, call the generator.

**Right column (`flexGrow`): live preview.**
Render the generated body line-by-line as it streams, with light syntax tinting:
`#` headings → violet bold, `---` frontmatter rules → faint, `- `/`1.` list items → fg, `key:`
→ fg2. The prototype's `previewRows` mapping is the exact spec.

**Streaming source.** Two honest options:
- **LLM-live** (provider active): stream tokens from `synthesizeInstructions(input)` (the LLM
  path in `data.ts`) straight into the preview, then install.
- **Template** (offline): `generateSpec(input)` is synchronous, so there's nothing to stream —
  render it instantly, or fake a short reveal for parity. The README already promises the template
  fallback, so guard the LLM call and degrade (this is the open `PLAN.md` item
  "graceful LLM fallback in TUI install path").

**Diff before write (Phase-2 item).** After the body is ready, do **not** write immediately. Build
the planned-file list and show it in the confirm dialog (§12). Reuse `src/ui/diff.ts`'s
`renderDiff` if it fits; otherwise the file list is enough:
```
+ ~/.claude/skills/<slug>/SKILL.md
+ ~/.cursor/rules/<slug>.mdc
~ ~/.config/perezdev/perezdev-lock.json
```
On `y`, run `installDescribed(...)`. On `n`, write nothing (mirror `--dry-run` semantics).

**Project Skills list.** Below the form, list installed agents from `home.agents`
(`name`, `version`, `targets`) as compact cards — replaces "View Project Skills".

---

## 11. F3 MCP Manager → `src/tui/pages/mcp.tsx`

Keep the existing `MCP_DIRECTORY` + focus model (`list | button | input`) but lay it out as a
**directory (left, flexGrow)** + **context panel (right, width `MCP_PANEL_W`)**.

**Directory rows:** status dot (`●` installed green / `○` available faint), name, a `[tag]`, the
server id, and a right-aligned action hint (`install` / `installed`). Selected row gets an accent
border/`►`. `home.mcp` gives installed ids; `MCP_SERVERS`/catalog (`data.ts` `catalogMcp`) gives
the directory. `Enter`/`i` installs the selected one via `installCatalogMcp(server, targets)`.

**Run Discovery Scanner:** `s` (or focus + `Enter`) runs your existing recommender
(`home.mcpSuggestions` / `recommend()` in `src/core/recommend.ts`) and fills the **right panel**
with recommended servers **for this repo**, each with a one-line reason and confidence, and an
`+ add` action. The prototype shows the shape (github → "git remote detected", puppeteer →
"react app · e2e candidate", …) — populate from real `recommend()` output.

**Custom integration prompt:** the bottom input compiles a server spec. On `Enter`, call your
intent→config path (the LLM that returns `{command, args, env}`, used by `installCustomMcp` in
`data.ts`) and render the resulting **`mcpServers` JSON** in the right panel with key tinting,
then an `Install across N tools` action that calls `installCustomMcp(...)`.

**Staging log** stays, but filter it to `cat:"mcp"` lines (per §8a) instead of the current
content-sniffing regex (`PLAN.md` Phase-2 item).

---

## 12. Confirm dialog + diff → `components.tsx`

Extend `ConfirmBox` to take an optional `diff: string[]` and render it colored: lines starting
`+` green, `-` red, `~` yellow, else `fg2`. The `PendingConfirm` interface already carries
`desc`/`run`/`resolve`/`ignore`; add `diff?: string[]`.

```tsx
export function ConfirmBox({ desc, diff }: { desc: string; diff?: string[] }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.warn} paddingX={1} marginTop={1}>
      <Text color={theme.warn} bold>⚠ MANUAL CONFIRMATION REQUIRED</Text>
      <Text>{desc}</Text>
      {diff && diff.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {diff.map((d, i) => {
            const c = d[0] === "+" ? theme.ok : d[0] === "-" ? theme.bad : d[0] === "~" ? theme.warn : theme.fg2;
            return <Text key={i} color={c}>{d}</Text>;
          })}
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={theme.ok} bold>[Y] Approve</Text><Text dimColor>  │  </Text><Text color={theme.bad} bold>[N] Cancel</Text>
      </Box>
    </Box>
  );
}
```

Auto-approve when `autonomy === "auto"` (skip the dialog, log an `auto-approved:` line) — exactly
as the prototype does. The destructive-command denylist in `src/core/exec.ts` still applies even in
auto mode.

---

## 13. Help overlay → `src/tui/help.tsx` (NEW)

`?` (when not typing) sets `help = true`. While help is open, **render `<HelpOverlay/>` instead of
the page body** (terminals can't dim-and-float; full replace is the idiom), `Esc` closes. Two
columns: **KEYS** (the §7 table) and **SLASH COMMANDS** (from the command registry). This is the
Phase-2 "keyboard help overlay" item — and because the slash column reads the same registry as
§8d, the cheatsheet can't go stale.

---

## 14. Task checklist (work top to bottom)

> Each task is independently shippable. `npm run typecheck` + `npm test` after each.

- [ ] **T1 — Theme.** Extend `theme.ts` per §5 (keep old keys). *Verify:* `tsc` clean; existing pages still render.
- [ ] **T2 — Version.** Read real version from `package.json` (drop hardcoded `v2.0` in `shell.tsx`). *Verify:* header shows `0.1.0`. (`PLAN.md` Phase-2)
- [ ] **T3 — Rail.** Add `rail.tsx` (`<EnvRail/>`), remove `<Badges>` from `ChatPage`, render rail from `Shell`. *Verify:* IDE/CLI/Ollama + signals show on all 3 pages and reflect a real scan.
- [ ] **T4 — Shell.** Rewrite `shell.tsx` to header/body-row/status-bar (§6). *Verify:* layout holds at 120×40 and ~100 cols; no overflow.
- [ ] **T5 — Status bar.** Add `statusbar.tsx` (§3/§6): `◆ model` (accent fill) · `NORMAL/PLANNING` · `autonomy` · `thinking` · key hints. *Verify:* `Shift+Tab`/`Ctrl+A`/`Ctrl+T` flip the labels.
- [ ] **T6 — Keyboard.** Consolidate global keys in `console.tsx` `useInput` (§7); add `typing` gate. *Verify:* `1/2/3`, `F1-3`, `?`, `Esc` work; letters don't leak while a field is focused.
- [ ] **T7 — Command registry.** Add `commands.ts` (name → {usage, help, handler}); regenerate `/help` from it. *Verify:* test asserts every registry key appears in `/help`. (`PLAN.md`)
- [ ] **T8 — Slash menu.** Add `slash.tsx` (§8d); wire `↑/↓/Tab/Enter`. *Verify:* typing `/` filters; `Tab` completes; `Enter` runs.
- [ ] **T9 — Category log + offline banner.** `Row` gets `cat`; height-derived cap; banner in `ChatPage`. *Verify:* mcp staging shows only `cat:"mcp"`; banner shows with no provider.
- [ ] **T10 — `/pull` progress.** Stream Ollama pull progress into a log bar (engine stream). *Verify:* `/pull qwen2.5-coder` animates to 100% then logs ready. (`PLAN.md`)
- [ ] **T11 — Skill Builder.** Rewrite `factory.tsx` (§10): compose form + live preview; guard LLM→template fallback. *Verify:* goal+Enter streams a body; offline still installs via template.
- [ ] **T12 — Diff confirm.** Extend `ConfirmBox` (§12); show planned files before `/build`,`/create`,`/install`,`/mcp` writes. *Verify:* confirm renders ≥1 diff line; `n` writes nothing. (`PLAN.md`)
- [ ] **T13 — MCP page.** Rewrite `mcp.tsx` (§11): directory + scanner panel + compiled-JSON panel, real `recommend()` data. *Verify:* scanner fills panel; install updates the dot.
- [ ] **T14 — Help overlay.** Add `help.tsx` (§13). *Verify:* `?` opens, `Esc` closes; snapshot test.
- [ ] **T15 — Model picker.** `Ctrl+M` selectable model list (from `/models`). *Verify:* selecting updates the header pill + status bar. (`PLAN.md`)

---

## 15. Ink gotchas & dependencies

- **No floating layers.** Overlays (slash menu, help, confirm, model picker) take real rows —
  render them *in flow*, replacing or sitting above content. Budget vertical space accordingly.
- **No letter-spacing, no box-shadow, no border-radius gradients.** Lean on caps + color + the
  `round`/`single` border styles. The "soft card" look = `borderStyle="round" borderColor={theme.line}`.
- **`backgroundColor` is the only "fill."** The active-tab / chip / status-segment look is
  `<Text backgroundColor={accent} color="#04161a"> … </Text>` with literal padding spaces inside.
- **Width math.** Reserve `RAIL_W + 4` for the rail+borders; give the rest to `flexGrow`. Always
  test in a real terminal, not just `ink-testing-library` (which has no real width).
- **`wrap`.** `<Text wrap="truncate-end">` / `"wrap"` controls overflow; use `truncate-start` for
  long paths (mirrors the prototype's right-aligned ellipsis on the preview path).
- **Dependencies:** everything you need is already in `package.json` — `ink`, `ink-gradient`,
  `ink-spinner`, `ink-text-input`, `react`. No new runtime deps (stays within `PLAN.md` non-goals).
- **Keep the data layer untouched.** `src/core/*`, `src/adapters/*`, `src/registry/*`,
  `src/engine/*` don't change. If something the UI needs isn't exposed, add a thin selector in
  `data.ts`, not logic in a component.

---

## 16. Mapping summary (prototype → code), at a glance

| Prototype area              | Real file(s)                                  | Backing data / call                              |
| --------------------------- | --------------------------------------------- | ------------------------------------------------ |
| Header + tabs + model pill  | `shell.tsx`                                    | `package.json` version, provider status          |
| Left environment rail       | `rail.tsx` (new)                               | `home.ecosystem`, `home.scan.signals`            |
| Status bar                  | `statusbar.tsx` (new)                          | `mode/autonomy/thinking/model` state             |
| Chat log + streaming        | `pages/chat.tsx`, `components.tsx` `Row`       | `log` state, provider stream                     |
| Slash autocomplete          | `slash.tsx` (new), `commands.ts` (new)         | command registry                                 |
| Skill Builder + preview     | `pages/factory.tsx`                            | `installDescribed`, `synthesizeInstructions`, `generateSpec` |
| MCP directory + scanner     | `pages/mcp.tsx`                                | `catalogMcp`, `recommend()`, `installCatalogMcp`, `installCustomMcp` |
| Confirm + diff              | `components.tsx` `ConfirmBox`                  | `PendingConfirm`, `src/ui/diff.ts`               |
| Help overlay                | `help.tsx` (new)                               | command registry + keymap                        |

Build it page by page; the prototype is the source of truth for spacing, color, and copy.
```
```
