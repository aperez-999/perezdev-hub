# PerezDev Hub

Local-first AI SDLC workbench in the terminal. Chat with a model, generate agent skills, install MCP servers, and skim a tooling feed — then write the same skills into **Claude Code, Cursor, Copilot, Codex, Cline, Windsurf, and Roo Code**.

```
◤ PEREZDEV HUB  v0.2.0          Chat   Skills   MCP   News          ● llama3
 Ask anything about this repo.
 Shift+← / →  pages ·  Ctrl+A  local auto ·  ?  keys
 › ask or /command
```

Command: **`perezdev`** (alias **`pdh`**). Requires **Node ≥ 20**. Optional: [Ollama](https://ollama.com) for local models.

```bash
npm install -g perezdev-hub
perezdev
```

Or once: `npx perezdev-hub`.

First launch: logo (↵ continue) → detect tools → pick write-targets → Superpowers pack, generate in hub, or empty Chat. `Esc` skips. After that, `~/.perezdevrc` has `setup_complete` and you land on Chat.

## Hub

Four pages. `Shift+←` / `Shift+→` always work (including while typing). `?` is the full keymap.

| Page | Job |
| --- | --- |
| **Chat** | Prompt the active model (Ollama, else Anthropic/OpenAI if a key is set). Slash commands live here. |
| **Skills** | Describe an agent → generate skill markdown → install into the selected tools. |
| **MCP** | Catalog servers (filesystem, git, databases, …) or compile a custom one from a prompt. |
| **News** | Live HN for Claude Code, Ollama, MCP, and Cursor. Bundled digest if HN is down. |

Writes that change files show an inline **Y / N** plus a short diff. **Local auto** (`Ctrl+A` or `/auto`) skips that gate for **skill file writes**. Custom/LLM MCP injects and autofix **installs** still confirm.

### Keys

| Key | Action |
| --- | --- |
| `Shift+←` / `Shift+→` | Chat ↔ Skills ↔ MCP ↔ News |
| `F1`–`F4` | Same pages (legacy) |
| `1`–`4` | Jump page when you are not typing (Chat is always typing) |
| `?` | Help overlay (empty prompt; `/help` always works) |
| `Ctrl+M` | Pick model |
| `Shift+Tab` | Normal ↔ Planning (reasoning model when one is pulled) |
| `Ctrl+A` | Manual ↔ local auto |
| `Ctrl+T` | Local reply length (low / medium / high) |
| `Tab` | Cycle Skills / MCP compose fields |
| `Y` / `N` | Approve or cancel a pending write |
| `Esc` | Close overlay or dialog; back to Chat |

### Slash commands (Chat)

Plain text is a prompt. `@file <prompt>` injects that file. `/` opens autocomplete.

| Command | What it does |
| --- | --- |
| `/build <description>` | Generate a custom agent and skill files |
| `/create <name>: <purpose>` | Same, with an explicit name |
| `/mcp auto` · `/mcp <id>` | Discover for this repo, or inject a catalog server |
| `/auto` | Toggle local auto |
| `/pull <model>` | Download an Ollama model |
| `/recommend` · `/install <name>` | Project-tailored suggestions, then install one |
| `/tree [dir]` · `/diagnose <file>` | File-tree map · traceback diagnosis |
| `/autofix <file> [\| cmd]` | Diagnose, then patch + verify in a gated loop |
| `/models` · `/list` | Pulled models · installed agents and MCP servers |
| `/yes` · `/clear` · `/help` · `/quit` | Confirm pending write · clear log · help · exit |

## CLI

The hub is optional. Every command works from a script. `perezdev --help` and `perezdev <cmd> --help` list flags.

| Command | What it does |
| --- | --- |
| `perezdev` | Fullscreen hub (TTY). Otherwise prints help. |
| `perezdev menu` | Clack list menu (recommend / describe / manage / catalog) — not the hub |
| `perezdev init` | Detect tools, set up `~/.config/perezdev` |
| `perezdev presets` | List starter agents for `create --preset` |
| `perezdev create` | Generate and install (`-n` `-p` `-t`, `--preset`, `-a`, `-y`, `--dry-run`) |
| `perezdev stack <id>` | Bundle of agents + MCP (`review`, `backend`, `frontend`, `ship`, `plan`) |
| `perezdev list` · `show <name>` | Inventory / inspect (`--json`; MCP env values are `***`) |
| `perezdev update [name]` | Re-apply files (repairs drift); `--bump` · `--dry-run` |
| `perezdev remove <name>` | Remove across tools and restore backups |
| `perezdev export <name>` · `import <file>` | Share one agent as JSON |
| `perezdev manage` | Interactive show / update / export / remove |
| `perezdev profile export` | Bundle agents + MCP into JSON (`-o`, `-` for stdout) |
| `perezdev profile show <file\|url>` | Preview a profile (`--json`) |
| `perezdev profile import <file\|url>` | Install a profile (`-t` `-y` `--force` `--dry-run`) |
| `perezdev doctor` | Drift and broken installs (`--fix` `--json`) |
| `perezdev fix [file]` | Diagnose a traceback (Python engine; stdin ok) |
| `perezdev autofix [file]` | Patch + verify loop (`--verify '<cmd>'`; `-y` still asks for installs) |
| `perezdev map [dir]` | File-tree (`-d` depth) |

```bash
perezdev presets
perezdev create --preset code-reviewer -y
perezdev create -n pr-summarizer -p "summarize PR diffs" -t cursor,claude-code -y
perezdev stack review
perezdev list --json
perezdev profile export -o team-setup.json
```

Skills are AI-generated when a model is up; otherwise a domain template (review, tests, debug, docs, …). Cloud is optional:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_API_KEY=sk-...
ollama pull qwen2.5-coder             # Normal
ollama pull deepseek-r1               # Planning
```

## Layout

One **agent spec** → per-tool adapters:

- **Claude Code** — `~/.claude/skills/<name>/SKILL.md` + MCP in `settings.json`
- **Cursor** — `~/.cursor/rules/<name>.mdc` + MCP in `mcp.json`
- **Copilot / Codex / Cline / Windsurf / Roo** — markdown rules in each tool’s config dir

Lockfile: `~/.config/perezdev/perezdev-lock.json`. Hub prefs: `~/.perezdevrc`. Writes go only to those tool dirs (never shell rc): backup, validate, atomic write, rollback on failure. MCP launches are allowlisted (`npx` / `uvx` / `docker` / `node`). Autofix refuses destructive shell even in auto.

`fix` / `map` / traceback parse use bundled **Python 3** (stdlib). Chat talks to Ollama at `localhost:11434` and keeps the model loaded.

## Development

```bash
npm install
npm test          # vitest, including Ink TUI tests
npm run smoke     # intro / setup / hub / live News frames
npm run dev       # live hub
npm run build
npm run typecheck
```

`core/` spec and providers, `adapters/` one file per tool, `tui/` Ink pages, `commands/` CLI.

## License

MIT © Alejandro Perez
