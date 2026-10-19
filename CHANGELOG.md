# Changelog

## 0.3.0 — 2026-10-19

A refocus on one job: portable agent config with drift detection.

### Breaking

- **Project scope is the default inside a git repository.** Files go into the repo and the lockfile is `perezdev.lock.json` at its root. Use `-g` for the previous home-directory behavior.
- **Tool paths now match each tool's documentation.** Cursor and Copilot get Agent Skills (`.agents/skills/`) instead of `~/.cursor/rules` and `~/.config/github-copilot/prompts`; Codex gets skills instead of `~/.codex/prompts`; Cline user rules go to `~/Documents/Cline/Rules`; Windsurf rules are project-only; Claude Code MCP servers go to `~/.claude.json` / `.mcp.json` instead of `~/.claude/settings.json`, which Claude Code doesn't read servers from. Run `perezdev sync -g` once to move existing agents; old perezdev-generated files are removed.
- Removed the fullscreen TUI, Chat, News, `fix`, `autofix`, `map`, the Python engine, and the Superpowers installer. The CLI is the product.
- `update` is now `sync` (`update` still works). `profile import --force` is now `--overwrite`; `--force` everywhere means "overwrite files perezdev didn't create".
- A corrupt lockfile is an error instead of being treated as empty.

### Added

- `perezdev add <source>` installs published skills from GitHub (`owner/repo[/path][@ref]`, or a URL) or a local folder: `SKILL.md` verbatim plus its bundled text files, recorded in the lockfile with the source and commit. `--list` shows what a source contains; `--skill` picks.
- `perezdev upgrade [name]` re-fetches added skills and shows the upstream diff before applying it.
- `perezdev agents-md` keeps a Commands section in `AGENTS.md`, generated from `package.json`, `pyproject.toml`/`requirements.txt`, `go.mod`, `Cargo.toml`, and `Makefile`, and imports it into `CLAUDE.md` for Claude Code. `doctor` fails when the section no longer matches the manifests; `--off` removes it.
- Copilot MCP servers, in `.vscode/mcp.json` (VS Code's `servers` format).
- Codex MCP servers, in `~/.codex/config.toml` and `.codex/config.toml`. perezdev edits only its own `[mcp_servers.*]` tables and keeps comments and other settings byte-for-byte.
- Onboarding that says what to do next. After `init`, `add`, `create`, `mcp`, and `stack`, perezdev shows which tool reads which file, how to try it in each tool, MCP launchers missing from `PATH` (`uvx`, `docker`) and secrets that aren't set, generated files that `.gitignore` hides from teammates, and the exact `git add` to commit the setup.
- `perezdev ci` (also offered by `init`) writes a GitHub Actions workflow that runs `doctor` on pull requests.
- `perezdev` with no arguments prints status — scope, tools, installed items, drift, and what's still needed — or a short "Get started" when nothing is set up.
- `perezdev init` scans the repo and installs fitting agents and MCP servers.
- `perezdev mcp [ids…]` lists or installs catalog MCP servers.
- `doctor` reports `modified` files (hand edits, or a lockfile change that wasn't synced), not just missing ones, and exits 1 on either.
- Shared skill directories are deduplicated: Cursor and Copilot reuse `.claude/skills` or `.agents/skills` instead of getting their own copy.
- Re-applying an agent removes files it no longer needs (changed targets, dropped MCP servers).
- `--dry-run`, `-y`, `--force`, `-t`, and `-g` work the same on every command that writes.

### Fixed

- The MCP catalog pointed at packages that don't exist on npm (`server-git`, `server-fetch`, `server-docker`, `server-sentry`, `server-sqlite`) or are deprecated (`server-github`, `server-postgres`, `server-puppeteer`, …). It now lists maintained servers only, and never stores secrets.
- Installing several agents that share an MCP config in one command no longer drops all but the last server.
- A malformed MCP config was silently replaced with a fresh one; it's now left alone and reported.
- Atomic writes reset file permissions (`~/.claude.json` became world-readable); modes are now preserved.
- Unknown `--target` ids were silently ignored; they're now an error.
- `npx perezdev-hub` works (the package now has a bin with its own name).
- `doctor` treats a CRLF checkout (Git for Windows' default) as unchanged instead of reporting every generated file as modified.
- `doctor`'s verdict on `CLAUDE.md` depends only on the repo, so it gives the same answer on a laptop and in CI.
- Removing the last MCP server from a config perezdev created deletes the file instead of leaving `{"mcpServers": {}}`; emptied folders in a repo are removed too.
- Generated skills: grammatical descriptions ("Use when reviewing…"), no repeated purpose, no generic filler sections.
