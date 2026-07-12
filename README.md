# PerezDev Hub

> An animated terminal hub for your AI coding workflow — generate custom agent skills, manage MCP servers, and prompt local models, across every AI coding tool you use.

PerezDev Hub scans your project, **generates** agents tailored to it (no canned presets), and installs them — together with the MCP servers that fit — across **Claude Code, Cursor, Copilot, Codex, Cline, Windsurf, and Roo Code**. It runs an OpenDev-style fullscreen TUI, talks to **local Ollama models** (with a transparent cloud fallback), and never leaves your machine unless you give it a key.

```
┌──────────────────────────────────────────────────────────────┐
│  ◤ PEREZDEV HUB   [1] Chat  [2] Skills  [3] MCP  [4] Start     │
│  ────────────────────────────────────────  ⇄ Ctrl ←/→ ───────│
│  [IDEs] ● cursor  ○ copilot  ○ cline  ○ windsurf  ○ roo        │
│  [CLIs] ● claude-code  ○ codex  ○ aider  ● ollama (local)      │
│  project: git · node · typescript · react · vitest            │
│  [AUTOMATION & LOG STREAM] …                                  │
│  ◆ qwen2.5-coder │ Autonomy: manual │ Thinking: medium        │
└──────────────────────────────────────────────────────────────┘
```

Launching `perezdev` plays a short animated intro (logo + boot checklist + a
quick-start card), then drops you into the hub. Press any key to skip it.

Command: `perezdev` (aliases `pdh`, `inspo`).

## Why

The agent-skills ecosystem is fragmented: Claude Code `SKILL.md`, Cursor `.mdc` rules, Copilot instructions, MCP servers — every tool has its own format. No tool cleanly does *"describe what I want → generate a real agent → install it everywhere I work."* PerezDev Hub is that tool.

- **Generative, not preset** — you describe a goal (`frontend dev`, `web3 auditor`) and the skill body is written for it, by your active LLM when one is available, or a deterministic domain-aware template offline.
- **Multi-tool by design** — one canonical agent spec, one adapter per tool. Adding a tool is one file.
- **Local-first** — prompts run against Ollama on your machine. Cloud keys are optional, never required.
- **Safe writes** — every config write is backed up, validated, and atomic; a failed multi-file install rolls back.

## Install

Requires **Node ≥ 20**.

```bash
npm install -g perezdev-hub
perezdev
```

Or run once without installing:

```bash
npx perezdev-hub
```

For local model prompting, install [Ollama](https://ollama.com) and pull a model (see [Local engine](#local-engine)).

## Quick start

Just run it:

```bash
perezdev
```

This opens the fullscreen TUI. The header badges are **live** — they reflect the AI tools actually configured on your machine and the stack of the current project. You drive everything by typing; there's no menu to arrow through.

Four pages, switched with **`Ctrl+←` / `Ctrl+→`** (or the digits `1`–`4` off the chat page; the legacy `F1`–`F4` keys still work). `Esc` returns to chat:

| Page | What it does |
| --- | --- |
| **`1` 🤖 Chat Engine** | Prompt your local/cloud model; ecosystem map + log stream. |
| **`2` ⚙ Skill Builder** | *Create Custom Agent* (goal → LLM-generated skill), *Run Workspace Diagnoser*, *View Project Skills*. |
| **`3` 🔌 MCP Manager** | Industry MCP directory with live status, a discovery scanner, and a custom integration prompt that compiles `mcpServers` JSON. |
| **`4` 🚀 Quick Start** | Onboarding overview — what each engine does, the key map, commands to try, and your live setup. Reachable any time. |

In **Manual** autonomy any action that writes files pops an inline `[Y] Approve / [N] Cancel` dialog on the current page. Toggle to **Autonomous** to skip it.

### Keys

| Key | Action |
| --- | --- |
| `Ctrl+←` / `Ctrl+→` | Previous / next page (wraps) |
| `1` / `2` / `3` / `4` | Jump to a page (digits work off the chat page; `F1`–`F4` still work) |
| `Shift+Tab` | Normal ↔ Planning mode (routes to a reasoning model) |
| `Ctrl+A` | Manual ↔ Autonomous |
| `Ctrl+T` | Thinking depth (low / medium / high) |
| `Tab` (Page 3) | Cycle focus: directory → scanner → prompt field |
| `Esc` | Close overlay / dialog, return to chat |

### Slash commands (in the chat page)

| Command | Description |
| --- | --- |
| `<prompt>` | Ask the active model (local Ollama or cloud) |
| `@file <prompt>` | Inject a file's contents as context |
| `/build <description>` | Generate a custom agent + skill files |
| `/create <name>: <purpose>` | Generate an agent with an explicit name |
| `/mcp auto` | Discover & inject MCP servers for this repo |
| `/pull <model>` | Download an Ollama model (live progress) |
| `/recommend` · `/install <name>` | Project-tailored suggestions, then install one |
| `/tree [dir]` · `/diagnose <file>` | File-tree map · traceback diagnosis |
| `/autofix <file> [\| cmd]` | Diagnose, then patch + verify in a gated loop until it passes |
| `/models` · `/list` | Pulled models · installed agents & MCP servers |
| `/yes` · `/clear` · `/help` · `/quit` | Apply pending action · clear log · help · exit |

## Generation modes

PerezDev writes **automation-ready** skills, not stubs — a structured body with discovery trigger, responsibilities, a numbered workflow, guidelines, definition-of-done, output, and guardrails.

- **AI-generated (when a provider is active)** — your goal is routed to the active LLM (local Ollama or a cloud key) with a metaprompt that returns a complete, specific skill body. This is the default whenever a model is reachable.
- **Template (offline fallback)** — deterministic and instant. A domain inferencer (review, testing, debugging, docs, refactor, security, accessibility, SQL, API, performance, planning, architecture, releases) tailors the skill to your purpose and stack.

Set a cloud key to use a hosted model when you have no local one:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_API_KEY=sk-...
```

## CLI commands

The TUI is optional — every capability is scriptable:

| Command | What it does |
| --- | --- |
| `perezdev` | Animated TUI (default in a terminal) |
| `perezdev menu` | Plain list menu (no fullscreen) |
| `perezdev create` | Generate a custom agent and install it (`-n/-p/-r/-t/-y`, `--preset`, `-a`) |
| `perezdev stack <id>` | Install a bundled set of agents + MCP servers |
| `perezdev profile export` | Bundle your whole setup into a shareable JSON profile (`-o <file>`) |
| `perezdev profile import <file\|url>` | Replicate a setup from a file or URL (`-t`, `-y`, `--force`) |
| `perezdev profile show <file\|url>` | Preview a profile's agents + MCP servers |
| `perezdev manage` | Pick an agent/MCP → show / update / export / remove |
| `perezdev list` | List managed agents and MCP servers across tools (`--json`) |
| `perezdev show <name>` | Inspect an agent's spec, files, and instructions |
| `perezdev update [name]` | Re-apply one or all agents (repairs drift); `--bump` bumps version |
| `perezdev remove <name>` | Remove a managed agent and restore backups |
| `perezdev export <name>` | Export an agent as JSON (`--out <file>`) for sharing |
| `perezdev import <file>` | Install a shared agent from JSON |
| `perezdev fix [file]` | Diagnose a traceback → cause, `file:line`, and the fix |
| `perezdev autofix [file]` | Diagnose, then patch + verify in a gated loop (`--verify <cmd>`, `-y`) |
| `perezdev map [dir]` | Print a file-tree map (`-d` depth) |
| `perezdev init` | Detect installed tools, set up `~/.config/perezdev` |
| `perezdev doctor` | Diagnose config drift and broken installs |

```bash
perezdev create -n pr-summarizer -p "summarize PR diffs" -y   # non-interactive
perezdev list
```

## How it works

One canonical **agent spec** is translated into each tool's native format by a per-tool **adapter**:

- **Claude Code** — `~/.claude/skills/<name>/SKILL.md` + MCP servers in `settings.json`
- **Cursor** — `~/.cursor/rules/<name>.mdc` + MCP servers in `mcp.json`
- **Copilot / Codex / Cline / Windsurf / Roo Code** — per-agent markdown rule files in each tool's config dir

PerezDev records what it installs in `~/.config/perezdev/perezdev-lock.json`, so `list`, `update`, `doctor`, and `remove` work across every tool. MCP servers can also be installed standalone. Your TUI preferences (last tab, autonomy mode, declined MCP servers) persist in `~/.perezdevrc`.

## Local engine

Some features run on a bundled local **Python 3** engine (stdlib only), spoken to over a JSON stdin/stdout protocol — no cloud calls:

- **`fix`** parses a traceback, finds the offending file/line, classifies the error, and prints the fix.
- **`map`** renders a fast file-tree of any directory.
- The **chat console** detects pulled models via `http://localhost:11434/api/tags` and streams completions from Ollama, routing to a fast code model in Normal mode and a reasoning model in Planning mode.

```bash
ollama pull qwen2.5-coder   # fast, code-optimized (Normal slot)
ollama pull deepseek-r1     # reasoning (Planning slot)
```

If `python3` or Ollama is missing, the affected feature reports a readable message and the rest of the app keeps working.

## Auto-fix loop

`perezdev autofix <file>` (or `/autofix` in the TUI) closes the loop on a failing program: it diagnoses the traceback, then asks the active model for one action at a time — a surgical search/replace **patch**, a dependency **install**, or a **verify** re-run — applies it under the same backup/rollback safeguards, re-runs the verify command, and repeats until the error clears or a 3-attempt cap is hit. Every mutating step is gated by the `[Y] Approve / [N] Cancel` dialog (auto-approved only in Autonomous mode), and a denylist refuses destructive commands (`rm -rf`, `sudo`, `curl | sh`, force-push, …) even then. The verify command is inferred from the error and your stack; override it with `--verify '<cmd>'` (CLI) or `/autofix <file> | <cmd>` (TUI).

## Shareable profiles

Replicate a whole setup in one command — no server, no accounts. `perezdev profile export` bundles your managed agents and MCP servers into a single `perezdev-profile.json`; share it as a file, gist, or in a repo. Anyone runs `perezdev profile import <file|url>` to install the lot across their own detected tools (`perezdev profile show <file|url>` previews first). Already-installed items are skipped unless you pass `--force`, and a failed item never blocks the rest.

```bash
perezdev profile export -o team-setup.json
perezdev profile import https://gist.githubusercontent.com/.../team-setup.json
```

## Safety

PerezDev only writes to each tool's standard user config directories and never touches shell rc files. Every config write is guarded: a timestamped backup is copied into the app cache, the new content is validated and written atomically via a temp file, and if a multi-file task throws mid-way every touched file is rolled back.

## Development

```bash
npm install
npm run dev -- --help   # run from source
npm run build           # bundle to dist/
npm test                # vitest
npm run typecheck
```

The codebase is small and layered: `core/` (spec, generation, scan, providers, engine bridge), `adapters/` (one file per tool), `registry/` (bundled catalog), `tui/` (Ink components + pages), and `commands/` (the CLI surface). Adding a new AI tool is a single adapter implementing the `Adapter` interface.

## License

MIT © Alejandro Perez
