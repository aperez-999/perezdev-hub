# Contributing

perezdev does one job: turn a single agent spec into each AI coding tool's native files, and tell you when those files drift. Changes that make that more correct, safer, or cover another tool are very welcome.

## Setup

```bash
npm install
npm test            # unit, filesystem (temp HOME + repo), and CLI end-to-end
npm run typecheck
npm run dev -- status
```

Node 20 or newer.

## Layout

```
src/
  adapters/tools.ts   where every tool reads agents + MCP servers (the only per-tool code)
  adapters/plan.ts    spec → files, skill-directory dedupe, batched MCP merges
  adapters/render.ts  SKILL.md / rule markdown, ownership marker
  adapters/mcp-config.ts  MCP configs: JSON (`mcpServers`, VS Code `servers`) and Codex TOML, surgical merge + prune
  adapters/context.ts perezdev's marked block inside AGENTS.md / CLAUDE.md
  core/install.ts     plan → preview → apply (backup, atomic write, verify, rollback)
  core/doctor.ts      lockfile vs disk: ok / missing / modified / tool-absent
  core/sources.ts     `perezdev add`: GitHub tarball / local folder → SKILL.md folders
  core/commands.ts    build/test/lint commands from a repo's manifests (AGENTS.md)
  core/scope.ts       project (git root) vs user (~) resolution
  commands/           one file per CLI command
  registry/           MCP catalog and stacks
```

## Adding or fixing a tool

Tools move their config paths. When one does:

1. Update the tool's entry in `src/adapters/tools.ts` — `agents`, `mcp`, and `signals` for both `user` and `project` scope — and its `docs` link.
2. If perezdev previously wrote somewhere else, add the old path to `legacy` so `perezdev sync -g` cleans it up.
3. Add or update a case in `test/layout.test.ts`.
4. Update the table in the README.

Link the tool's documentation in the PR. Paths copied from blog posts are how 0.2 ended up writing files nobody read.

A new tool is the same, plus its id in `TOOL_IDS` (`src/core/agent-spec.ts`).

## Adding an MCP server to the catalog

Only maintained packages, launched with `npx`, `uvx`, `docker`, or `node`. Put required secrets in `needs`, never in `env`. Link the server's repository in the PR.

## Rules for changes

- `npm test` and `npm run typecheck` pass.
- Every write goes through `planChanges` → `applyPlan`; don't write tool files directly.
- Never overwrite or delete a file perezdev didn't create: it must carry the ownership marker (`isOwned`) or be recorded in the lockfile.
- No network calls except the explicit ones (`add`/`upgrade` from GitHub, profile URLs, optional Claude API).
- No secrets in commits or fixtures.

## The README demo

`docs/demo.gif` is recorded from `docs/demo.tape`. After changing output that appears in it, re-render with `brew install vhs` once, then `npm run build && docs/render-demo.sh`.

## Releasing

Bump the version and push the tag; [`release.yml`](.github/workflows/release.yml) publishes to npm with provenance and creates the GitHub release from CHANGELOG.md:

```bash
npm version minor            # or patch / major — updates package.json and tags vX.Y.Z
git push origin main --follow-tags
```

Move the `Unreleased` notes in CHANGELOG.md under the new version first.

## Commits

Conventional style, imperative subject, the why in the body when it isn't obvious:

```
fix(adapters): write Cline user rules to ~/Documents/Cline/Rules
```

## Code of Conduct

[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report incidents to the address in [SECURITY.md](SECURITY.md).

## License

MIT. By contributing you agree your work is licensed under the same terms.
