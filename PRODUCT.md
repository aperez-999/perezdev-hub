# Product

## Register

product

## Platform

web

The shipped surface is a Node ≥ 20 **terminal UI** (Ink). Platform is `web` only as the closest official value: it is not iOS/Android. Design against 80–132 columns and 24–40 rows, not a browser.

## Users

Primary: a working software developer who already uses at least one AI coding tool (Cursor, Claude Code, Copilot, Codex, Cline, Windsurf, Roo) and often a local model via Ollama. They open `perezdev` from a project directory, in a hurry, in a dim terminal, wanting to talk to a model or install a skill without learning a new IDE.

Secondary: the same person later, as a power user — slash commands, profiles, `perezdev` CLI without the TUI.

They are not first-time programmers. They are impatient with dashboards that explain the product instead of doing the job.

## Product Purpose

PerezDev Hub is the **AI SDLC workbench** for a local machine: one place to run a model, encode how you work as skills/agents, and connect MCP tools — then install that setup across the editors you actually use.

Success is: within 30 seconds of `perezdev`, a first-time user can send a prompt and understand how to reach Skills and MCP without reading a README. A returning user never sees a tutorial.

## Positioning

Describe what you want → generate a real agent → install it everywhere you work, without leaving the terminal or requiring a cloud account.

## Brand Personality

Quiet, precise, local. Speaks like a senior engineer at a shared keyboard: short verbs, no mascot, no celebration of itself.

Three words: **direct, local, calm.**

## Anti-references

- A status dashboard that lists every unsupported tool as an empty circle.
- Fake NASA boot sequences that pretend to scan while nothing is scanned.
- Emoji-led tab bars and “AI product” gradient chrome.
- Command palettes that dump every feature on first paint.
- VS Code–style status soup (the same fact in the header, sidebar, and footer).

## Design Principles

1. **The prompt is the product.** If chrome and the conversation compete, chrome loses.
2. **Say each fact once.** Model, page, and brand have one home each.
3. **Show presence, not catalog.** Only detected tools and live state. Capabilities live in help.
4. **SDLC, not settings.** Chat is Run. Skills is Build. MCP is Connect. News is the feed. Confirm is Review.
5. **Safe by default, fast when asked.** Manual confirm on writes; Autonomous is a mode, not the landing.

## Accessibility & Inclusion

- Keyboard-only; every action has a key. Mouse is out of scope.
- Color is never the only status signal (dot + label, or word + color).
- `?` is the complete keymap; on-screen hints are one line and vanish once the user types.
- Respect `PDH_NO_INTRO` / non-TTY / tests: skip motion.
- Reduced motion: no intro animation; jump to the hub.
- Contrast: body text uses `theme.fg` (`#cdd6e0`) on the default dark terminal; do not use `theme.dim` for readable copy.
