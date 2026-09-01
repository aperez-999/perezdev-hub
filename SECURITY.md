# Security

perezdev writes AI coding-tool configuration: skill and rule files, MCP server configs, and its own lockfile. It never edits shell rc files and makes no network calls except fetching skills you `add`/`upgrade` from GitHub, a profile URL you pass it, and (if you set `ANTHROPIC_API_KEY`) the Claude API.

## What it guarantees

- Writes are backed up to `~/.config/perezdev/backups/`, atomic, verified after writing, and rolled back as a batch on failure.
- Files perezdev didn't create — no ownership marker and not recorded in the lockfile — are never overwritten (unless `--force`) or deleted.
- MCP configs are merged, never replaced; unparseable configs are left untouched. Existing file modes are kept.
- MCP launches are allowlisted to `npx`, `uvx`, `docker`, and `node`, with per-launcher bans on inline-code flags (`node -e`, `npx -c`) and Docker host access (`--privileged`, `-v`, `--network=host`, …), and no shell metacharacters or URL/`git+` package specs. This applies to the catalog, imported specs and profiles, and the lockfile.
- Profile URLs must be `https`, resolve to a public host, and may not redirect; responses are capped at 512 KB.
- `show --json` redacts MCP `env` values. The catalog never stores secrets.
- Skills added from GitHub are fetched over HTTPS from `api.github.com`, capped at 30 MB, and recorded with the exact commit. Only regular text files are copied (no symlinks, no hidden files, no `..` paths), at most 256 KB each and 2 MB per skill. The full content is shown before anything is written, and `upgrade` shows the upstream diff. A skill is instructions your agents will act on — treat adding one like adding a dependency.

## Reporting a vulnerability

Email **alexperezr456@gmail.com** with a description, steps to reproduce, and the affected version (`perezdev --version`). Please don't open a public issue for unreleased vulnerabilities. Expect an acknowledgement within a few days.
