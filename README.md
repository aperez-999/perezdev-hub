# perezdev

[![CI](https://github.com/aperez-999/perezdev-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/aperez-999/perezdev-hub/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/perezdev-hub)](https://www.npmjs.com/package/perezdev-hub)
[![license](https://img.shields.io/npm/l/perezdev-hub)](LICENSE)

Write your AI agent setup once — skills, rules, and MCP servers — and get it into every coding tool your team uses: **Claude Code, Codex, Cursor, GitHub Copilot, Cline, Windsurf, and Roo Code**. A lockfile records what's installed, and `perezdev doctor` fails CI when the generated files drift.

![perezdev setting up a repo, then catching and fixing a hand-edited skill](docs/demo.gif)

## What it does

AI coding tools can be taught how your team works, but each one reads that from its own files:

- **Skills / rules** — instructions an agent loads when a task matches ("how we review PRs", "how we write tests here"). Claude Code wants `.claude/skills/`, Windsurf wants `.windsurf/rules/`, Cline wants `.clinerules/`, and so on.
- **MCP servers** — extra tools an agent can call (git history, GitHub issues, your database, a browser). Each tool has its own config file and format.
- **AGENTS.md** — repo-wide notes most tools read, like which commands build and test the project.

perezdev manages all three from one place. You pick or write an agent once; it writes the right file for every tool you use, records it in `perezdev.lock.json`, and checks later that nothing drifted. It's a plain CLI: no account, no server, no telemetry. The npm package is `perezdev-hub`; the command is `perezdev`.

## Your first five minutes

**1. Set up the repo.** In any git repository:

```bash
npx perezdev-hub init
```

perezdev reads your stack (`package.json`, `pyproject.toml`, `go.mod`, …) and the tools you use, then offers: skills that fit (a reviewer for your framework, a test writer for your test runner, commit and PR helpers), MCP servers (`git`, `context7`, `playwright`, `postgres`…), a Commands section in `AGENTS.md`, and a CI check. You see every file as a diff before anything is written.

**2. See where things went and try them.** `init` ends by telling you exactly that:

```
◇  Where it went
│  Claude Code  .claude/skills · .mcp.json
│  Codex        .agents/skills · .codex/config.toml
│  Every tool   AGENTS.md (Commands section)
│  CI           perezdev doctor on every pull request
◇  Try it
│  Claude Code: new session; skills load when a task matches, or run /<skill-name>
│  Codex: restart it; skills load when a task matches
│  Then ask for something a skill covers, e.g. "review my staged changes"
│  Claude Code asks once to approve the servers in .mcp.json (or run /mcp).
◇  Before the MCP servers start
│  ! uvx isn't on PATH (needed by git) — install uv: https://docs.astral.sh/uv/…
◇  Share it (perezdev.lock.json + generated files)
│  git add .agents/ .claude/ .codex/ .github/ .mcp.json AGENTS.md perezdev.lock.json
│  git commit -m "chore: add AI agent setup (perezdev)"
```

**3. Commit it.** The generated files are ordinary files in your repo, so teammates get the same agents on `git pull`, whatever tool they use. perezdev warns you if `.gitignore` would hide any of them.

**4. Let CI keep it honest.** The workflow from `init` (or `perezdev ci`) runs `perezdev doctor` on every pull request. A hand-edited skill, a lockfile change nobody synced, or an `AGENTS.md` whose commands no longer match `package.json` fails the check, naming the file. `perezdev doctor --fix` puts it back.

**Day to day:** run `perezdev` for status and the next thing to do. `perezdev add` pulls in published skills, `perezdev create -p "…"` writes your own, `perezdev sync` applies a teammate's lockfile change, and `perezdev upgrade` updates skills you added.

## Why

Every agent tool reads instructions from a different place, in a slightly different format, and they keep moving. Claude Code wants `.claude/skills/<name>/SKILL.md` and `.mcp.json`; Windsurf wants `.windsurf/rules/*.md` with a `trigger`; Cline reads `.clinerules/`; Cursor and Copilot read the shared `.agents/skills/`. Keeping one reviewer prompt in sync across all of them by hand doesn't survive the second edit.

perezdev keeps a single spec per agent in `perezdev.lock.json` and generates each tool's native files from it:

- **One copy where tools share a directory.** Cursor and Copilot also load `.claude/skills/` and `.agents/skills/`, so perezdev writes the fewest copies that cover your tools — no skill loaded twice.
- **Drift is a failing check.** `doctor` compares every generated file and MCP entry with the lockfile: `missing`, `modified`, or `ok`. Exit code 1 on drift.
- **It never touches what it didn't write.** Generated files carry a marker, and the lockfile records every path. A hand-written skill at the same path is a conflict, not an overwrite.
- **Skills from anywhere, pinned.** `perezdev add anthropics/skills --skill pdf` installs a published skill byte-for-byte, with its scripts and reference files, recorded at the exact commit.
- **One AGENTS.md that stays true.** perezdev keeps a Commands section in AGENTS.md generated from your manifests, imports it into CLAUDE.md, and `doctor` fails when your scripts change and it goes stale.

## Install

```bash
npm install -g perezdev-hub   # provides `perezdev` (and the short alias `pdh`)
# or run without installing:
npx perezdev-hub <command>
```

Node 22 or newer.

## Scope

Like npm: inside a git repository, commands act on the **project** — files you commit, plus `perezdev.lock.json` at the repo root. Outside a repository, or with `-g`, they act on your **home directory**, and the lockfile lives in `~/.config/perezdev/`.

## Commands

| Command | |
| --- | --- |
| `perezdev` | Status: what's installed, whether it drifted, and what's still needed (launchers, secrets, uncommitted files, CI) |
| `perezdev init` | Scan the stack and install the agents + MCP servers that fit it |
| `perezdev create` | Generate an agent from a description: `-p "review SQL migrations for locking issues"` |
| `perezdev create --preset <id>` | Install a built-in agent (`perezdev presets` lists them) |
| `perezdev add <source>` | Install published skills from GitHub or a folder (see below) |
| `perezdev upgrade [name]` | Re-fetch added skills and apply upstream changes |
| `perezdev agents-md [--off]` | Keep a generated Commands section in AGENTS.md, imported by CLAUDE.md |
| `perezdev ci` | Add `.github/workflows/perezdev.yml`, which runs `doctor` on pull requests |
| `perezdev stack <id>` | Install a bundle (`review`, `backend`, `frontend`, `ship`, `plan`) |
| `perezdev mcp [ids…]` | List the MCP catalog, or install servers from it |
| `perezdev list` · `show <name>` | What's installed, and where each file lives |
| `perezdev sync [name]` | Regenerate tool files from the lockfile — after a pull, or after adding a tool |
| `perezdev remove <name>` | Delete an agent's files and any MCP servers only it used |
| `perezdev doctor [--fix]` | Check for drift; `--fix` rewrites from the lockfile |
| `perezdev export` · `import` | Share one agent as JSON |
| `perezdev profile export\|import\|show` | Share a whole setup as one JSON file (path or https URL) |
| `perezdev manage` | Interactive picker for the above |

Commands that write take `-t claude-code,cursor` (targets), `-g` (home directory), `--dry-run` (show the diff, write nothing), `-y` (don't ask), and `--force` (overwrite files perezdev didn't create). Without `-t`, targets come from `default_targets` in `~/.perezdevrc`, then tools detected in the repo, then tools installed on the machine. `--json` on `list`, `show`, and `doctor` prints machine-readable output.

## In CI

`perezdev ci` writes this for you (pinned to the perezdev minor version, so a release can't change your CI results without a PR):

```yaml
# .github/workflows/perezdev.yml
# Fails when the AI agent setup that perezdev generated (skills, rules, MCP
# configs, the AGENTS.md section) no longer matches perezdev.lock.json.
# Fix locally with `npx perezdev-hub doctor --fix` (or `sync`) and commit the result.
name: agents

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx -y perezdev-hub@~0.3 doctor
```

A PR that edits `.claude/skills/reviewer/SKILL.md` by hand, or changes `perezdev.lock.json` without regenerating, fails with the exact file:

```
  modified  reviewer → Cursor  .agents/skills/reviewer/SKILL.md

  ✗ 1 modified — repair with perezdev doctor --fix
```

## Skills from GitHub

[Agent Skills](https://agentskills.io) are folders with a `SKILL.md` and, often, scripts and reference files. perezdev installs them for every tool you use:

```bash
perezdev add anthropics/skills --list                 # what's in a repo
perezdev add anthropics/skills --skill pdf,docx      # take some
perezdev add github:obra/superpowers/skills/brainstorming@v7.0.0   # one folder, pinned
perezdev add https://github.com/owner/repo/tree/main/skills/x       # a URL works too
perezdev add ./skills/release-check                   # or a local folder you're writing
perezdev upgrade                                      # later: pull upstream changes, with a diff
```

`SKILL.md` and its bundled text files are copied verbatim into the skills directories your tools read (rule-only tools — Cline, Windsurf, Roo — get the instructions without the bundled files). The lockfile records the source and commit, so a teammate's `perezdev sync` reproduces the same bytes offline. Skills are instructions your agents will follow: review the plan before accepting it. Private repositories and higher rate limits use `GITHUB_TOKEN`.

## AGENTS.md

`AGENTS.md` is read by Codex, Cursor, Copilot, Windsurf, Cline, and Roo; Claude Code reads `CLAUDE.md`, which can import it. `perezdev agents-md` adds a marked section with the commands agents should run, taken from `package.json` (and your package manager), `pyproject.toml`/`requirements.txt`, `go.mod`, `Cargo.toml`, and `Makefile`:

```markdown
<!-- perezdev:begin -->
## Commands

Use these instead of guessing. Run them from the repository root.

- Install: `pnpm install`
- Build: `pnpm run build`
- Test: `pnpm test`
- Lint: `pnpm run lint`
<!-- perezdev:end -->
```

Everything outside the markers is yours. When Claude Code is in use, `CLAUDE.md` gets an `@AGENTS.md` import (unless it already has one). `sync` refreshes the section, `doctor` fails when it no longer matches the manifests, and `--off` removes it.

## Where files go

Paths are relative to the repo root (project) or `~` (user). Each was checked against the tool's docs; if one moved, [open a tool-support issue](https://github.com/aperez-999/perezdev-hub/issues/new?template=tool-support.yml).

| Tool | Agents (project) | Agents (user) | MCP (project / user) |
| --- | --- | --- | --- |
| [Claude Code](https://code.claude.com/docs/en/skills) | `.claude/skills/<name>/SKILL.md` | `~/.claude/skills/…` | `.mcp.json` / `~/.claude.json` |
| [Codex](https://learn.chatgpt.com/docs/build-skills) | `.agents/skills/<name>/SKILL.md` | `~/.agents/skills/…` | [`.codex/config.toml` / `~/.codex/config.toml`](https://developers.openai.com/codex/mcp) |
| [Cursor](https://cursor.com/docs/context/skills) | `.agents/skills/…` or `.claude/skills/…` | same, under `~` | `.cursor/mcp.json` / `~/.cursor/mcp.json` |
| [GitHub Copilot](https://code.visualstudio.com/docs/copilot/customization/agent-skills) | `.agents/skills/…` or `.claude/skills/…` | same, under `~` | [`.vscode/mcp.json`](https://code.visualstudio.com/docs/copilot/reference/mcp-configuration) / — |
| [Cline](https://docs.cline.bot/customization/cline-rules) | `.clinerules/<name>.md` | `~/Documents/Cline/Rules/…` | — |
| [Windsurf](https://docs.windsurf.com/windsurf/cascade/memories) | `.windsurf/rules/<name>.md` (`trigger: model_decision`) | — (single global file) | — |
| [Roo Code](https://roocodeinc.github.io/Roo-Code/features/custom-instructions) | `.roo/rules/<name>.md` | `~/.roo/rules/…` | `.roo/mcp.json` / — |

Skills follow the [Agent Skills](https://agentskills.io) format: `name` and `description` frontmatter, with perezdev's ownership marker inside the standard `metadata` map.

## MCP servers

`perezdev mcp` lists a small catalog of maintained servers — `git`, `github` (GitHub's official server, via Docker), `context7`, `playwright`, `postgres`, `redis`, `sentry`, and a few more. Secrets are never written to config files: servers that need a token read it from the environment your editor starts in, and `perezdev mcp` tells you which variable.

Codex's `config.toml` is edited surgically: perezdev adds or removes its own `[mcp_servers.<name>]` tables and leaves your comments and other settings byte-for-byte. (Codex applies a project's `.codex/config.toml` once you trust the project.)

Every MCP launch — from the catalog, an imported profile, or a hand-built agent — must use `npx`, `uvx`, `docker`, or `node`, with no shell metacharacters, URL package specs, inline-code flags, or Docker host access.

## Generated instructions

Without configuration, agents are built from deterministic templates tuned by what the description mentions (review, tests, debugging, docs, security, performance, …). With `ANTHROPIC_API_KEY` set and `@anthropic-ai/sdk` installed, `create` and `init` ask Claude to write the instructions instead, and fall back to the template on any failure.

## Safety

- Every write is backed up to `~/.config/perezdev/backups/`, written atomically, verified, and rolled back as a batch if anything fails.
- MCP configs are merged, never replaced. A config that isn't valid JSON or TOML is left alone and reported.
- Existing file permissions are preserved (`~/.claude.json` stays `0600`).
- `show --json` redacts MCP `env` values. Profile URLs must be public `https` hosts and can't redirect.

## Upgrading from 0.2

0.2 wrote to several paths the tools don't actually read (`~/.cursor/rules`, `~/.codex/prompts`, `~/.config/github-copilot/prompts`, `~/.clinerules`, `~/.codeium/windsurf/rules`, and MCP servers into `~/.claude/settings.json`). Run `perezdev sync -g` once: it rewrites everything to the documented locations and deletes the old perezdev-generated files. Files you wrote yourself are left alone.

## Development

```bash
npm install
npm test           # vitest — unit, filesystem, and CLI end-to-end
npm run typecheck
npm run dev -- doctor   # run from source
```

CI runs the suite on Linux, macOS, and Windows with Node 22 and 24. Releases are published from a version tag by [`release.yml`](.github/workflows/release.yml) with npm provenance.

The whole tool layer is one table in [`src/adapters/tools.ts`](src/adapters/tools.ts). Supporting a new tool, or fixing a path that moved, is usually a single entry there plus a test in `test/layout.test.ts`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT © Alejandro Perez
