# PerezDev Hub

A clean, guided terminal hub for setting up your AI coding workflow. It scans your project, **generates** agents tailored to it, and installs them — plus the MCP servers that fit — across Claude Code, Cursor, Copilot, and Codex.

No catalog of canned presets to pick through: you describe what you want (or let the project scan suggest it) and the agent's instructions are generated from your stack.

Command: `perezdev` (aliases `pdh`, `inspo`).

## Install

```bash
npm install -g perezdev-hub
# or run without installing
npx perezdev-hub --help
```

For local development, `npm link` symlinks the `perezdev` bin to your build so rebuilds take effect immediately.

## Quick start

Just run it. `perezdev` opens an animated fullscreen TUI that scans the current directory:

```bash
perezdev
```

It opens a single **OpenDev-style console**: a bordered, animated screen with a matrix header, a **tabbed page bar**, tool badges (IDEs / CLIs / Ollama), an `[AUTOMATION & LOG STREAM]`, a command input, and a live footer (`◆ model │ Autonomy │ Thinking │ ollama status`). You drive it by typing — no menu to arrow through. Everything you do appends to the log.

The header badges are **live, not hardcoded**: on launch the hub scans your workspace and home dir for each tool's real footprint — `.cursor/rules` / `.cursorrules`, `.clinerules`, `.windsurfrules`, `.github/copilot-instructions.md`, `~/.claude/settings.json`, `.aider.conf.yml` — and flips ● / ○ to mirror exactly what you have. The `project:` line maps your stack from `package.json` / `requirements.txt` / `Gemfile` / `go.mod` / `Cargo.toml` (languages, frameworks, databases incl. redis, and the named test framework). Your last tab, autonomy mode, and declined-MCP list persist in `~/.perezdevrc` and are restored on the next launch.

Three pages, switched with the function keys (or `1`/`2`/`3` off the chat page); `Esc` returns to chat:

- **`F1` 🤖 Chat Engine** — the prompt console + ecosystem map + log stream.
- **`F2` ⚙ Skill Builder** — an arrow-navigable factory: *Create Custom Agent* (inline `Agent Goal:` overlay → the active LLM compiles a full skill from your goal), *Run Workspace Diagnoser* (`Log file:` overlay → trace-regex tool), *View Project Skills* (lists installed `.md`/`.mdc` rules).
- **`F3` 🔌 MCP Manager** — an **industry MCP server directory** (filesystem, SQLite, Postgres, Brave Search, Docker, Puppeteer, Memory, GitHub) with live ●/○ status, a `[ Run Discovery Scanner ]` button (`Enter` runs `/mcp auto`), and a **custom integration prompt** field — describe a server in plain English and the active LLM emits the `mcpServers` JSON to stage and confirm. `Tab` cycles focus across the directory, the scanner button, and the prompt field.

In **Manual** autonomy any mutating action pops an inline **`[Y] Approve / [N] Cancel`** dialog right on the current page — no need to jump back to the chat bar (`/yes` still works too). While the dialog or a text overlay is open, background navigation and tab keys are frozen so keystrokes can't leak.

- **Type a prompt** → it streams from your **local Ollama model** (nothing leaves your machine).
- **`Shift+Tab`** Normal ↔ Planning (routes to a reasoning model) · **`Ctrl+A`** Manual ↔ Autonomous · **`Ctrl+T`** thinking depth.
- **`@file`** in a prompt injects that file's contents as context.
- **Slash commands:** `/build <description>` (generate a custom agent + `.md` skill) · `/mcp auto` (discover & inject MCP servers for this repo) · `/pull <model>` (download a local model with live progress) · `/recommend` · `/install <name>` · `/create <name>: <purpose>` · `/list` · `/tree [dir]` · `/diagnose <file>` · `/models` · `/help` · `/quit`. In Manual autonomy, mutating actions wait for `/yes`.

**Hybrid local/cloud:** PerezDev prefers your local Ollama models. If none are pulled but `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) is set, it transparently falls back to that cloud model and the footer shows `cloud active`. No Ollama and no key → a clear hint (not a raw error), and the rest of the app still works.

Prefer a plain list (no fullscreen)? `perezdev menu`. Or go straight to a command:

```bash
perezdev create                                  # describe → generate → install
perezdev create -n pr-summarizer -p "summarize PR diffs" -y   # non-interactive
perezdev list                                    # what's installed
perezdev manage                                  # pick an item → act on it
```

## Generated agents

inspo writes **automation-ready** skill files, not stubs. Each agent gets a structured body: a `Use to …` discovery trigger, `When to use`, `Responsibilities`, a numbered `Workflow`, `Guidelines`, `Definition of done`, `Output`, and `Guardrails`.

Two generation modes:

- **AI-generated (default when a provider is active)** — `/build` and the F2 factory route your goal through the active LLM (local Ollama or a cloud key) with a metaprompt that returns a complete skill body (Role & Scope, Responsibilities, Guidelines & Guardrails, Definitions of Done). Nothing is preset — type `embedded rust engineer` or `web3 auditor` and you get a skill written for exactly that.
- **Templates (fallback, no provider)** — deterministic and instant. A domain inferencer (review, testing, debugging, docs, refactor, security, **accessibility**, SQL, API, performance, planning, architecture, releases) tailors the responsibilities, workflow, and done-checks to your purpose and stack.
- **AI-generated (with `ANTHROPIC_API_KEY`)** — Opus 4.8 writes the entire body, specific to your exact request. This is the non-templated path; set the key for the best output:

  ```bash
  export ANTHROPIC_API_KEY=sk-ant-...
  perezdev create
  ```

## Commands

| Command | What it does |
| --- | --- |
| `perezdev` | Animated TUI — recommend, describe, manage, browse |
| `perezdev menu` | Plain list menu (no fullscreen) |
| `perezdev create` | Generate a custom agent and install it (`-n/-p/-t/-y`, `-a` advanced) |
| `perezdev manage` | Pick an agent/MCP → show / update / bump / export / remove |
| `perezdev list` | List managed agents and MCP servers across tools |
| `perezdev show <name>` | Inspect an agent's spec, files, and instructions |
| `perezdev update [name]` | Re-apply one or all agents (repairs drift); `--bump` bumps the version |
| `perezdev remove <name>` | Remove a managed agent/MCP server and restore backups |
| `perezdev export <name>` | Export an agent as JSON (`--out <file>`) for sharing |
| `perezdev import <file>` | Install a shared agent from JSON |
| `perezdev stack <id>` | Install a bundled set of agents + MCP servers at once |
| `perezdev fix [file]` | Diagnose a traceback (file or piped) → cause, file:line, and the fix |
| `perezdev map [dir]` | Print a file-tree map of a directory (`-d` depth) |
| `perezdev init` | Detect installed AI tools, set up `~/.config/perezdev` |
| `perezdev doctor` | Diagnose config drift and broken installs |

Keys in interactive prompts: `↑↓` move · `space` toggle · `enter` submit · `esc` cancel.

## How it works

One canonical **agent spec** is translated into each tool's native format by a per-tool **adapter**:

- **Claude Code** — `~/.claude/skills/<name>/SKILL.md` + MCP servers in `settings.json`
- **Cursor** — `~/.cursor/rules/<name>.mdc` + MCP servers in `mcp.json`
- **Copilot / Codex / Cline / Windsurf / Roo Code** — per-agent markdown rule files in each tool's config dir

Adding a tool is one new adapter file. inspo records what it installs in `~/.config/perezdev/perezdev-lock.json`, so `list`, `update`, `doctor`, and `remove` work across every tool.

MCP servers can also be installed standalone (no owning agent) into the MCP-capable tools.

## Local engine (Python)

Some features run on a local Python 3 engine (stdlib only), spoken to over a JSON stdin/stdout protocol from the TypeScript side — no cloud calls:

- **`perezdev fix`** — parses a traceback, finds the offending file and line, classifies the error, and prints the fix (e.g. the exact `pip`/`npm install`).
- **`perezdev map`** — a fast file-tree map of any directory.

Both are also reachable from the TUI under **Map project tree** and **Diagnose a log file**. If `python3` is missing, the feature reports a readable error instead of failing — the rest of the app works regardless.

The engine also powers the **Prompt local AI** console: it detects pulled models via `http://localhost:11434/api/tags` and streams completions from Ollama, routing to a fast code model in Normal mode and a reasoning model in Planning mode. To use it:

```bash
# install Ollama (https://ollama.com), then pull a couple of models:
ollama pull qwen2.5-coder   # fast, code-optimized (Normal slot)
ollama pull deepseek-r1     # reasoning (Planning slot)
```

If Ollama isn't installed/running, the console says so and the rest of the app is unaffected — everything local-first, no cloud calls.

## Safety

inspo only writes to each tool's standard config directories and never injects into shell rc files. Config writes are guarded: a timestamped backup is copied into the app cache, the new content is validated and written atomically (via a temp file), and if a multi-file task throws mid-way every touched file is rolled back to its backup.

## Development

```bash
npm install
npm run dev -- --help   # run from source
npm run build           # bundle to dist/
npm test                # vitest
npm run typecheck
```

## Roadmap

Remote-refreshable catalog · shareable hub profiles / team sync · richer project signals for recommendations · companion web view.
