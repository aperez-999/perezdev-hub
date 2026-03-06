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

Navigate with `↑↓`, `enter` to select, `esc` to go back, `q` to quit. Views:

- **Recommend** — tailored, generated suggestions for *this* project, each with a reason. `space` to check, `enter` to install (watch them generate one by one).
- **Describe** — type what you want ("review my React code for a11y") → an agent is generated and installed, in place.
- **Manage** — `u` update · `b` bump · `x` remove.
- **Browse** — install MCP servers, or grab a CLI agent's install command.

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

- **Templates (default, no key)** — deterministic and instant. A domain inferencer (review, testing, debugging, docs, refactor, security, **accessibility**, SQL, API, performance, planning, architecture, releases) tailors the responsibilities, workflow, and done-checks to your purpose and stack.
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
| `perezdev init` | Detect installed AI tools, set up `~/.config/perezdev` |
| `perezdev doctor` | Diagnose config drift and broken installs |

Keys in interactive prompts: `↑↓` move · `space` toggle · `enter` submit · `esc` cancel.

## How it works

One canonical **agent spec** is translated into each tool's native format by a per-tool **adapter**:

- **Claude Code** — `~/.claude/skills/<name>/SKILL.md` + MCP servers in `settings.json`
- **Cursor** — `~/.cursor/rules/<name>.mdc` + MCP servers in `mcp.json`
- **Copilot / Codex** — markdown instruction files (MCP not yet wired)

Adding a tool is one new adapter file. inspo records what it installs in `~/.config/perezdev/perezdev-lock.json`, so `list`, `update`, `doctor`, and `remove` work across every tool.

MCP servers can also be installed standalone (no owning agent) into the MCP-capable tools.

## Safety

inspo only writes to each tool's standard config directories, backs up files before changing them, previews a diff before writing, and never injects into shell rc files.

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
