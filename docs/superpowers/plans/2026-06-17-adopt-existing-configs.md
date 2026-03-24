# Adopt Existing Configs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `perezdev adopt` — discover AI-config files perezdev didn't create, reverse-parse them into the canonical `AgentSpec`, ingest them into the lockfile, and optionally mirror them across tools — surfaced consistently across all three TUI pages.

**Architecture:** Add the read direction to the adapter hinge: an optional `discover()` returns a tool's *unowned* per-agent files. A deterministic, offline reverse parser (`core/adopt.ts`) turns each into a valid `AgentSpec` (`source: "adopted"`). Adoption is a read-only ingest into the lockfile; the only file writes are opt-in mirroring through the existing hardened `installSpec`. The TUI `/adopt` command + `refresh()` make adopted agents reflect on every page (rail counts, F2 Project Skills); per-tool format correctness is guaranteed because mirroring routes through each adapter's native `write()`.

**Tech Stack:** TypeScript (ESM), Zod, Ink/React (TUI), commander + @clack/prompts (CLI), vitest.

> **Session note on commits:** the user asked to keep changes *staged, not committed*, this session. Each task's final step shows a `git commit`; when executing, run the `git add` but hold the commit (stage only) unless the user says otherwise.

**Spec:** `docs/superpowers/specs/2026-06-17-adopt-existing-configs-design.md`

**Scope note (refinement of the spec):** all `FlatMarkdownAdapter` tools (codex, copilot, cline, windsurf, roo) already store **per-agent `.md` files in a directory** — they are not monolithic blobs. So implementing `discover()` once on that base class covers five tools, plus claude-code and cursor implement their own. This stays within the spec's "per-agent only" scope and broadens coverage for free.

---

### Task 1: Add `"adopted"` to the spec `source` enum

**Files:**
- Modify: `src/core/agent-spec.ts:54`
- Test: `test/adopt.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `test/adopt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { agentSpecSchema } from "../src/core/agent-spec.js";

describe("adopt: spec source enum", () => {
  it("accepts source 'adopted'", () => {
    const spec = agentSpecSchema.parse({
      name: "x-rule",
      description: "adopted rule for testing the schema",
      role: "x-rule assistant",
      instructions: "do the thing",
      targets: ["cursor"],
      source: "adopted",
    });
    expect(spec.source).toBe("adopted");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adopt.test.ts -t "source 'adopted'"`
Expected: FAIL — zod rejects `"adopted"` (invalid enum value).

- [ ] **Step 3: Implement the change**

In `src/core/agent-spec.ts`, change the `source` line:

```ts
  /** How this spec was produced. */
  source: z.enum(["generated", "imported", "adopted"]).default("generated"),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adopt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/agent-spec.ts test/adopt.test.ts
git commit -m "feat(adopt): allow source 'adopted' in AgentSpec"
```

---

### Task 2: `DiscoveredItem` type + optional `discover()` on the Adapter interface

**Files:**
- Modify: `src/adapters/types.ts`

- [ ] **Step 1: Add the type and interface method**

In `src/adapters/types.ts`, after the `ManagedItem` interface add:

```ts
/** A config item present in a tool that perezdev does NOT own — an adopt candidate. */
export interface DiscoveredItem {
  /** Raw item name (filename stem or skill dir name). */
  name: string;
  tool: ToolId;
  /** Absolute path of the backing file. */
  path: string;
  /** Raw file contents, for reverse parsing. */
  content: string;
}
```

Inside the `Adapter` interface, after `list()`:

```ts
  /**
   * Read-only. Enumerate per-agent items in this tool's config that perezdev
   * does NOT own (would not appear in `list()`), as candidates for `adopt`.
   * Adapters without a per-agent source omit this method.
   */
  discover?(): Promise<DiscoveredItem[]>;
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit 2>&1 | grep -v "menu.ts\|phase1.test.ts" || echo "clean"`
Expected: `clean` (only the two known pre-existing errors are filtered out).

- [ ] **Step 3: Commit**

```bash
git add src/adapters/types.ts
git commit -m "feat(adopt): add DiscoveredItem + optional Adapter.discover()"
```

---

### Task 3: Shared read helpers in `shared.ts` (`splitFrontmatter`, `scanDirUnowned`)

**Files:**
- Modify: `src/adapters/shared.ts`
- Test: `test/adopt.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/adopt.test.ts`:

```ts
import { splitFrontmatter } from "../src/adapters/shared.js";

describe("adopt: splitFrontmatter", () => {
  it("splits frontmatter data from the body", () => {
    const src = `---\nname: foo\ndescription: A test rule\n---\n# Title\n\nbody text`;
    const { data, body } = splitFrontmatter(src);
    expect(data.name).toBe("foo");
    expect(data.description).toBe("A test rule");
    expect(body).toBe("# Title\n\nbody text");
  });

  it("returns the whole content as body when there is no frontmatter", () => {
    const src = `# Title\n\njust markdown`;
    const { data, body } = splitFrontmatter(src);
    expect(data).toEqual({});
    expect(body).toBe(src);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adopt.test.ts -t "splitFrontmatter"`
Expected: FAIL — `splitFrontmatter` is not exported.

- [ ] **Step 3: Implement in `src/adapters/shared.ts`**

Add `import type { DiscoveredItem } from "./types.js";` and `import type { ToolId } from "../core/agent-spec.js";` and `import { readdir } from "node:fs/promises";` and `import { join } from "node:path";` at the top (merge with existing imports).

Change the existing `parseFrontmatter` declaration to be exported:

```ts
/** Read top-level `key: scalar` pairs from a leading frontmatter block (arrays/nesting skipped). */
export function parseFrontmatter(content: string): Record<string, string | boolean> {
```

Add these two functions at the end of the file:

```ts
/** Split a markdown doc into its frontmatter scalars and the body after it.
 *  When there is no leading `--- … ---` block, the whole content is the body. */
export function splitFrontmatter(content: string): {
  data: Record<string, string | boolean>;
  body: string;
} {
  const m = /^---\n[\s\S]*?\n---\n?/.exec(content);
  if (!m) return { data: {}, body: content };
  return { data: parseFrontmatter(content), body: content.slice(m[0].length) };
}

/** Read every `*${ext}` file directly in `dir` that perezdev does NOT own and
 *  return them as adopt candidates (read-only). Missing dir → []. */
export async function scanDirUnowned(dir: string, ext: string, tool: ToolId): Promise<DiscoveredItem[]> {
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: DiscoveredItem[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(ext)) continue;
    const path = join(dir, e.name);
    const content = await readIfExists(path);
    if (content && !isOwned(content)) {
      out.push({ name: e.name.slice(0, -ext.length), tool, path, content });
    }
  }
  return out;
}
```

Add `exists` to the existing `../util/fs-safe.js` import in `shared.ts` (it currently imports `atomicWrite, backup, readIfExists`):

```ts
import { atomicWrite, backup, exists, readIfExists } from "../util/fs-safe.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adopt.test.ts -t "splitFrontmatter"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/shared.ts test/adopt.test.ts
git commit -m "feat(adopt): export splitFrontmatter + add scanDirUnowned helper"
```

---

### Task 4: Implement `discover()` on the three per-agent adapter shapes

**Files:**
- Modify: `src/adapters/flat-markdown.ts` (covers codex, copilot, cline, windsurf, roo)
- Modify: `src/adapters/cursor.ts`
- Modify: `src/adapters/claude-code.ts`
- Test: `test/adopt.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/adopt.test.ts`:

```ts
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach } from "vitest";
import { CursorAdapter } from "../src/adapters/cursor.js";

describe("adopt: CursorAdapter.discover", () => {
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "pdh-adopt-"));
    process.env.HOME = home;
    delete process.env.XDG_CONFIG_HOME;
    const rules = join(home, ".cursor", "rules");
    await mkdir(rules, { recursive: true });
    // unowned (hand-written) rule
    await writeFile(join(rules, "my-style.mdc"), `---\nname: my-style\ndescription: My house style\n---\nUse tabs.`);
    // owned (perezdev) rule — must be ignored
    await writeFile(join(rules, "owned.mdc"), `---\nname: owned\ndescription: x\nx-perezdev: true\n---\nbody`);
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("returns only the unowned rule, with content", async () => {
    const items = await new CursorAdapter().discover!();
    expect(items.map((i) => i.name)).toEqual(["my-style"]);
    expect(items[0]!.tool).toBe("cursor");
    expect(items[0]!.content).toContain("Use tabs.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adopt.test.ts -t "CursorAdapter.discover"`
Expected: FAIL — `discover` is not a function.

- [ ] **Step 3: Implement in each adapter**

In `src/adapters/flat-markdown.ts`, add `DiscoveredItem` to the type import and `scanDirUnowned` to the shared import, then add the method to the class:

```ts
import type { Adapter, Detection, DiscoveredItem, ManagedItem, PlannedFile } from "./types.js";
import { buildInstructionMarkdown, commitFile, isOwned, planFile, readVersion, scanDirUnowned } from "./shared.js";
```

```ts
  async discover(): Promise<DiscoveredItem[]> {
    return scanDirUnowned(this.agentsDir, ".md", this.id);
  }
```

In `src/adapters/cursor.ts`, add `DiscoveredItem` to the type import and `scanDirUnowned` to the shared import, then add to the class:

```ts
  async discover(): Promise<DiscoveredItem[]> {
    return scanDirUnowned(this.rulesDir, ".mdc", this.id);
  }
```

In `src/adapters/claude-code.ts`, add `DiscoveredItem` to the type import, then add to the class (skills live in subdirectories, so this one walks dirs rather than using `scanDirUnowned`):

```ts
  async discover(): Promise<DiscoveredItem[]> {
    if (!(await exists(this.skillsDir))) return [];
    const entries = await readdir(this.skillsDir, { withFileTypes: true });
    const out: DiscoveredItem[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const path = this.skillFile(e.name);
      const content = await readIfExists(path);
      if (content && !isOwned(content)) out.push({ name: e.name, tool: this.id, path, content });
    }
    return out;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adopt.test.ts -t "CursorAdapter.discover"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/flat-markdown.ts src/adapters/cursor.ts src/adapters/claude-code.ts test/adopt.test.ts
git commit -m "feat(adopt): implement Adapter.discover() for per-agent tools"
```

---

### Task 5: Reverse parser — `parseAdopted` in `core/adopt.ts`

**Files:**
- Create: `src/core/adopt.ts`
- Test: `test/adopt.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/adopt.test.ts`:

```ts
import { parseAdopted } from "../src/core/adopt.js";
import type { DiscoveredItem } from "../src/adapters/types.js";

const item = (over: Partial<DiscoveredItem>): DiscoveredItem => ({
  name: "my-rule", tool: "cursor", path: "/x/my-rule.mdc", content: "", ...over,
});

describe("adopt: parseAdopted", () => {
  it("uses frontmatter name/description/role when present", () => {
    const c = parseAdopted(
      item({ content: `---\nname: api-style\ndescription: How we write APIs\nrole: API reviewer\n---\nBe consistent.` }),
      new Set(),
    );
    expect(c.spec.name).toBe("api-style");
    expect(c.spec.description).toBe("How we write APIs");
    expect(c.spec.role).toBe("API reviewer");
    expect(c.spec.instructions).toBe("Be consistent.");
    expect(c.spec.source).toBe("adopted");
    expect(c.spec.targets).toEqual(["cursor"]);
    expect(c.conflict).toBe(false);
  });

  it("derives name from filename and description from the first heading when no frontmatter", () => {
    const c = parseAdopted(item({ name: "My Rule!", content: `# Keep functions small\n\nSplit big ones.` }), new Set());
    expect(c.spec.name).toBe("my-rule");
    expect(c.spec.description).toBe("Keep functions small");
    expect(c.spec.role).toBe("my-rule assistant");
  });

  it("falls back to a synthetic description when the source is too short", () => {
    const c = parseAdopted(item({ name: "tiny", content: `ok` }), new Set());
    expect(c.spec.description).toBe("adopted tiny rule from cursor");
    expect(c.spec.instructions).toBe("ok");
  });

  it("flags a conflict when the name is already managed", () => {
    const c = parseAdopted(item({ name: "dupe" }), new Set(["dupe"]));
    expect(c.conflict).toBe(true);
    expect(c.spec.name).toBe("dupe");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adopt.test.ts -t "parseAdopted"`
Expected: FAIL — cannot find module `../src/core/adopt.js`.

- [ ] **Step 3: Implement `src/core/adopt.ts`**

```ts
import { agentSpecSchema, type AgentSpec, type ToolId } from "./agent-spec.js";
import { splitFrontmatter } from "../adapters/shared.js";
import type { DiscoveredItem } from "../adapters/types.js";

/** A discovered config file parsed into an installable spec, plus provenance. */
export interface AdoptCandidate {
  spec: AgentSpec;
  sourceTool: ToolId;
  sourcePath: string;
  /** True when the derived name already exists in the lockfile. */
  conflict: boolean;
}

/** Slugify free text into a kebab name (lowercase, hyphen-separated, ≤64). */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** First markdown heading text, else the first non-empty sentence, else null. */
function firstHeadingOrSentence(body: string): string | null {
  const heading = body.match(/^#{1,6}\s+(.+?)\s*$/m);
  if (heading) return heading[1]!.trim();
  const line = body.split("\n").map((l) => l.trim()).find((l) => l.length > 0 && l !== "---");
  if (!line) return null;
  return line.split(/(?<=[.!?])\s/)[0]!.trim();
}

/** Clamp/normalize a description into the schema's 8–400 range. */
function clampDescription(raw: string | null, name: string, tool: ToolId): string {
  let d = (raw ?? "").trim();
  if (d.length > 400) d = d.slice(0, 397).trimEnd() + "…";
  if (d.length < 8) d = `adopted ${name} rule from ${tool}`;
  return d;
}

/** Reverse-parse a discovered file into a valid AgentSpec. Deterministic, offline. */
export function parseAdopted(item: DiscoveredItem, taken: Set<string>): AdoptCandidate {
  const { data, body } = splitFrontmatter(item.content);

  const rawName = typeof data.name === "string" && data.name.trim() ? data.name : item.name;
  let name = slugify(rawName);
  if (name.length < 2) name = `adopted-${item.tool}`;

  const descSource = typeof data.description === "string" ? data.description : firstHeadingOrSentence(body);
  const description = clampDescription(descSource, name, item.tool);

  const role =
    typeof data.role === "string" && data.role.trim().length >= 4 ? data.role.trim() : `${name} assistant`;
  const version = typeof data.version === "string" ? data.version : "0.1.0";

  const spec = agentSpecSchema.parse({
    name,
    description,
    role,
    instructions: body.trim() || description,
    allowedTools: [],
    mcpDependencies: [],
    targets: [item.tool],
    version,
    source: "adopted",
  });

  return { spec, sourceTool: item.tool, sourcePath: item.path, conflict: taken.has(name) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adopt.test.ts -t "parseAdopted"`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add src/core/adopt.ts test/adopt.test.ts
git commit -m "feat(adopt): deterministic reverse parser parseAdopted"
```

---

### Task 6: Orchestration — `discoverAdoptable` + `adoptCandidate`

**Files:**
- Modify: `src/core/adopt.ts`
- Test: `test/adopt.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/adopt.test.ts`:

```ts
import { mkdtemp as mkdtemp2 } from "node:fs/promises"; // (alias not required; reuse mkdtemp)
import { discoverAdoptable, adoptCandidate } from "../src/core/adopt.js";
import { listEntries } from "../src/core/lockfile.js";
import { readIfExists } from "../src/util/fs-safe.js";

describe("adopt: orchestration (round-trip)", () => {
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "pdh-adopt2-"));
    process.env.HOME = home;
    delete process.env.XDG_CONFIG_HOME;
    const rules = join(home, ".cursor", "rules");
    await mkdir(rules, { recursive: true });
    await writeFile(join(rules, "tabs.mdc"), `---\nname: tabs\ndescription: Always indent with tabs\n---\nUse tabs, not spaces.`);
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("discovers, adopts into the lockfile (read-only), then mirrors to Claude Code", async () => {
    const cands = await discoverAdoptable();
    expect(cands.map((c) => c.spec.name)).toContain("tabs");
    const tabs = cands.find((c) => c.spec.name === "tabs")!;

    // source file unchanged after read-only ingest
    const before = await readIfExists(tabs.sourcePath);

    const r = await adoptCandidate(tabs, "2026-06-17T00:00:00Z", { mirrorTo: ["claude-code"] });
    expect(r.adopted).toBe(true);

    const after = await readIfExists(tabs.sourcePath);
    expect(after).toBe(before); // adopt never mutates the source tool's file

    const managed = await listEntries();
    expect(managed.map((e) => e.spec.name)).toContain("tabs");

    // mirrored Claude SKILL.md carries the original instructions
    const skill = await readIfExists(join(home, ".claude", "skills", "tabs", "SKILL.md"));
    expect(skill).toContain("Use tabs, not spaces.");
  });

  it("skips an already-managed name unless forced", async () => {
    const [c] = await discoverAdoptable();
    await adoptCandidate(c!, "2026-06-17T00:00:00Z");
    const again = await discoverAdoptable();
    expect(again.find((x) => x.spec.name === "tabs")!.conflict).toBe(true);
    const r = await adoptCandidate(again.find((x) => x.spec.name === "tabs")!, "2026-06-17T00:00:00Z");
    expect(r.adopted).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adopt.test.ts -t "orchestration"`
Expected: FAIL — `discoverAdoptable`/`adoptCandidate` not exported.

- [ ] **Step 3: Implement in `src/core/adopt.ts`**

Add imports at the top:

```ts
import { allAdapters, detectAll } from "../adapters/registry.js";
import { listEntries, upsertAgent } from "./lockfile.js";
import { installSpec } from "./install.js";
```

Append:

```ts
/** Discover adopt candidates across every tool that supports discovery.
 *  De-dupes by derived name (first tool wins) and flags lockfile collisions. */
export async function discoverAdoptable(opts: { tools?: ToolId[] } = {}): Promise<AdoptCandidate[]> {
  const lockNames = new Set((await listEntries()).map((e) => e.spec.name));
  const adapters = allAdapters().filter(
    (a) => typeof a.discover === "function" && (!opts.tools || opts.tools.includes(a.id)),
  );
  const out: AdoptCandidate[] = [];
  const seen = new Set<string>();
  for (const a of adapters) {
    for (const di of await a.discover!()) {
      const c = parseAdopted(di, lockNames);
      if (seen.has(c.spec.name)) continue; // same logical agent surfaced by two tools
      seen.add(c.spec.name);
      out.push(c);
    }
  }
  return out;
}

/** Ingest a candidate into the lockfile (read-only to the source tool); optionally
 *  mirror it into other tools via the hardened installSpec path. */
export async function adoptCandidate(
  candidate: AdoptCandidate,
  now: string,
  opts: { mirrorTo?: ToolId[]; force?: boolean } = {},
): Promise<{ adopted: boolean; mirroredPaths: string[] }> {
  const managed = new Set((await listEntries()).map((e) => e.spec.name));
  if (managed.has(candidate.spec.name) && !opts.force) return { adopted: false, mirroredPaths: [] };

  await upsertAgent(candidate.spec, now);

  let mirroredPaths: string[] = [];
  if (opts.mirrorTo && opts.mirrorTo.length > 0) {
    const written = await installSpec({ ...candidate.spec, targets: opts.mirrorTo }, now);
    mirroredPaths = written.map((f) => f.path);
  }
  return { adopted: true, mirroredPaths };
}

/** Resolve a `--mirror` argument into tool ids (`"all"` = detected, minus the source). */
export async function resolveMirrorTargets(arg: string | undefined, source: ToolId): Promise<ToolId[]> {
  if (!arg) return [];
  if (arg === "all") {
    const detected = (await detectAll()).filter((d) => d.detection.installed).map((d) => d.adapter.id);
    return detected.filter((id) => id !== source);
  }
  return arg.split(",").map((s) => s.trim()).filter(Boolean) as ToolId[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/adopt.test.ts`
Expected: PASS (all adopt tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/adopt.ts test/adopt.test.ts
git commit -m "feat(adopt): discoverAdoptable + adoptCandidate orchestration"
```

---

### Task 7: CLI command `perezdev adopt`

**Files:**
- Create: `src/commands/adopt.ts`
- Modify: `src/index.ts`
- Test: `test/adopt.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/adopt.test.ts`:

```ts
import { runAdopt } from "../src/commands/adopt.js";

describe("adopt: CLI runAdopt", () => {
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "pdh-adopt3-"));
    process.env.HOME = home;
    delete process.env.XDG_CONFIG_HOME;
    const rules = join(home, ".cursor", "rules");
    await mkdir(rules, { recursive: true });
    await writeFile(join(rules, "naming.mdc"), `---\nname: naming\ndescription: Naming conventions to follow\n---\nUse camelCase.`);
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("adopts all discovered agents non-interactively with -y", async () => {
    await runAdopt({ yes: true });
    const managed = await listEntries();
    expect(managed.map((e) => e.spec.name)).toContain("naming");
  });

  it("--dry-run writes nothing to the lockfile", async () => {
    await runAdopt({ yes: true, dryRun: true });
    const managed = await listEntries();
    expect(managed.map((e) => e.spec.name)).not.toContain("naming");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/adopt.test.ts -t "runAdopt"`
Expected: FAIL — cannot find module `../src/commands/adopt.js`.

- [ ] **Step 3: Implement `src/commands/adopt.ts`**

```ts
import pc from "picocolors";
import type { ToolId } from "../core/agent-spec.js";
import { planSpec } from "../core/install.js";
import { discoverAdoptable, adoptCandidate, resolveMirrorTargets, type AdoptCandidate } from "../core/adopt.js";
import { p, guardCancel, renderDiff } from "../ui/prompts.js";

export interface AdoptOptions {
  tool?: string;
  mirror?: string;
  yes?: boolean;
  dryRun?: boolean;
  force?: boolean;
  json?: boolean;
}

const isTty = Boolean(process.stdout.isTTY);

/** Discover unmanaged per-tool configs and bring them under management. */
export async function runAdopt(opts: AdoptOptions = {}): Promise<void> {
  const tools = opts.tool ? (opts.tool.split(",").map((s) => s.trim()) as ToolId[]) : undefined;
  const candidates = await discoverAdoptable({ tools });
  const adoptable = candidates.filter((c) => !c.conflict || opts.force);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        candidates.map((c) => ({ name: c.spec.name, tool: c.sourceTool, path: c.sourcePath, conflict: c.conflict })),
        null,
        2,
      ) + "\n",
    );
    return;
  }

  p.intro(pc.bgCyan(pc.black(" perezdev adopt ")));
  if (candidates.length === 0) {
    p.outro(pc.dim("No unmanaged agent configs found to adopt."));
    return;
  }
  if (adoptable.length === 0) {
    p.outro(pc.dim("All discovered configs are already managed. Re-adopt with --force."));
    return;
  }

  // Selection: every adoptable item unless interactive and the user narrows it.
  let chosen: AdoptCandidate[] = adoptable;
  const auto = opts.yes === true || !isTty;
  if (!auto) {
    const picked = guardCancel(
      await p.multiselect({
        message: "Select configs to adopt",
        options: adoptable.map((c) => ({
          value: c.spec.name,
          label: `${c.sourceTool} · ${c.spec.name}`,
          hint: c.spec.description.slice(0, 50),
        })),
        initialValues: adoptable.map((c) => c.spec.name),
        required: true,
      }),
    ) as string[];
    chosen = adoptable.filter((c) => picked.includes(c.spec.name));
  }

  const mirrorTo = chosen.length ? await resolveMirrorTargets(opts.mirror, chosen[0]!.sourceTool) : [];

  if (opts.dryRun) {
    if (mirrorTo.length) {
      const planned = (await Promise.all(chosen.map((c) => planSpec({ ...c.spec, targets: mirrorTo })))).flat();
      p.note(renderDiff(planned), "Files mirroring would write");
    }
    p.outro(
      pc.dim(
        `dry run — nothing written. Would adopt: ${chosen.map((c) => c.spec.name).join(", ")}${
          mirrorTo.length ? ` (mirror → ${mirrorTo.join(", ")})` : ""
        }.`,
      ),
    );
    return;
  }

  const now = new Date().toISOString();
  let adopted = 0;
  const mirroredPaths: string[] = [];
  for (const c of chosen) {
    const r = await adoptCandidate(c, now, { mirrorTo, force: opts.force });
    if (r.adopted) adopted++;
    mirroredPaths.push(...r.mirroredPaths);
  }

  p.outro(
    `${pc.green("✓")} Adopted ${pc.bold(String(adopted))} agent(s)${
      mirroredPaths.length ? ` · mirrored ${mirroredPaths.length} file(s) → ${mirrorTo.join(", ")}` : ""
    }. Run ${pc.bold("perezdev list")} to see them.`,
  );
}
```

- [ ] **Step 4: Register in `src/index.ts`**

Add the import near the other command imports (after the `runMap` import):

```ts
import { runAdopt } from "./commands/adopt.js";
```

Add the command registration (place it after the `import` command block, before `doctor`):

```ts
program
  .command("adopt")
  .description("Adopt existing hand-written agent configs into management (and optionally mirror them)")
  .option("-t, --tool <ids>", "limit discovery to comma-separated tools")
  .option("--mirror <ids|all>", "after adopting, install into these tools (or 'all' detected)")
  .option("-y, --yes", "adopt every discovered config without prompting")
  .option("--force", "re-adopt configs whose name is already managed")
  .option("--dry-run", "preview what would be adopted/written, without changing anything")
  .option("--json", "output machine-readable JSON of discovered candidates")
  .action(wrap(runAdopt));
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run test/adopt.test.ts -t "runAdopt"`
Expected: PASS.
Run: `npx tsc --noEmit 2>&1 | grep -v "menu.ts\|phase1.test.ts" || echo "clean"`
Expected: `clean`.

- [ ] **Step 6: Smoke test the bundled command**

Run: `npx tsup && node dist/index.js adopt --json`
Expected: prints a JSON array (likely `[]` or your real unmanaged configs) and exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/commands/adopt.ts src/index.ts test/adopt.test.ts
git commit -m "feat(adopt): perezdev adopt CLI command"
```

---

### Task 8: TUI `/adopt` — consistent across all three pages

**Files:**
- Modify: `src/tui/commands.ts`
- Modify: `src/tui/console.tsx`
- Test: `test/tui.test.tsx`

This is the cross-page-consistency task the user asked for: `/adopt` lives in the one command registry (so it appears in `/help` AND the slash menu on F1), mirroring routes through `installSpec` so **each tool gets its native format**, and `refresh()` after adopting reloads `home` so the **F2 Project Skills list and the rail counts update** — F3 (MCP) is intentionally unaffected because adopt is agents-only in v1.

- [ ] **Step 1: Add `/adopt` to the command registry**

In `src/tui/commands.ts`, add to the `COMMANDS` array (after the `/install` entry):

```ts
  { name: "/adopt", usage: "/adopt [mirror]", help: "Adopt existing unmanaged agent configs (optionally mirror)" },
```

- [ ] **Step 2: Write the failing TUI test**

Append a test inside the existing `describe("Console TUI", …)` block in `test/tui.test.tsx`. It seeds an unowned Cursor rule in the temp HOME, runs `/adopt`, and asserts the log reports adoption:

```ts
  it("/adopt brings an unmanaged config under management", async () => {
    const rules = join(home, ".cursor", "rules");
    await import("node:fs/promises").then((fs) => fs.mkdir(rules, { recursive: true }));
    await writeFile(join(rules, "house.mdc"), `---\nname: house\ndescription: House style rules to follow\n---\nPrefer composition.`);
    const { lastFrame, stdin } = render(<App />);
    await wait(1300);
    await typeLine(stdin, "/adopt");
    await until(() => /adopted \d+ agent/.test(lastFrame() ?? ""), 8000);
  }, 25000);
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/tui.test.tsx -t "/adopt brings"`
Expected: FAIL — `/adopt` is an unknown command (`unknown command: /adopt`).

- [ ] **Step 4: Wire `/adopt` in `src/tui/console.tsx`**

Add to the imports from `./data.js` is not needed; instead import the core directly. Near the other core imports add:

```ts
import { discoverAdoptable, adoptCandidate } from "../core/adopt.js";
import { planSpec } from "../core/install.js";
```

In the `slash()` function, add this handler (place it right after the `if (cmd === "install") { … }` block):

```ts
    if (cmd === "adopt") {
      const mirror = (rest[0] ?? "") === "mirror";
      setBusy(true);
      const cands = await discoverAdoptable();
      setBusy(false);
      const fresh = cands.filter((c) => !c.conflict);
      if (cands.length === 0) return push("info", "nothing to adopt — no unmanaged agent configs found", "build");
      if (fresh.length === 0) return push("info", "all discovered configs are already managed", "build");
      push("info", `discovered ${fresh.length}: ${fresh.map((c) => `${c.sourceTool}:${c.spec.name}`).join(", ")}`, "build");
      const mirrorTo = mirror ? targets : [];
      let diff: string[] | undefined;
      if (mirror) {
        try {
          const planned = (await Promise.all(fresh.map((c) => planSpec({ ...c.spec, targets: mirrorTo })))).flat();
          diff = plannedToDiff(planned);
        } catch {
          diff = undefined;
        }
      }
      return guard(
        `adopt ${fresh.length} agent(s)${mirror ? ` → mirror ${mirrorTo.join(", ")}` : ""}`,
        async () => {
          const now = new Date().toISOString();
          let n = 0;
          const paths: string[] = [];
          for (const c of fresh) {
            const r = await adoptCandidate(c, now, { mirrorTo });
            if (r.adopted) n++;
            paths.push(...r.mirroredPaths);
          }
          await refresh();
          reportInstall(`adopted ${n} agent(s)${paths.length ? ` · mirrored ${paths.length} file(s)` : ""}`, paths, "build");
          return "";
        },
        { diff },
      );
    }
```

Note: in the test, autonomy defaults to `manual`, so `/adopt` pops the confirm and the test would need a `y`. Adjust the test to approve — update Step 2's test body to send `y`:

```ts
    await until(() => /MANUAL CONFIRMATION REQUIRED/.test(lastFrame() ?? ""), 8000);
    await wait(200);
    stdin.write("y");
    await until(() => /adopted \d+ agent/.test(lastFrame() ?? ""), 8000);
```

(Replace the single `await until(/adopted/…)` line from Step 2 with the three lines above.)

- [ ] **Step 5: Run the TUI test to verify it passes**

Run: `npx vitest run test/tui.test.tsx -t "/adopt brings"`
Expected: PASS.

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npx vitest run`
Expected: all tests PASS.
Run: `npx tsc --noEmit 2>&1 | grep -v "menu.ts\|phase1.test.ts" || echo "clean"`
Expected: `clean`.

- [ ] **Step 7: Commit**

```bash
git add src/tui/commands.ts src/tui/console.tsx test/tui.test.tsx
git commit -m "feat(adopt): /adopt slash command, reflected across all pages"
```

---

### Task 9: Document `adopt` in the README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the CLI table row**

In the "CLI commands" table in `README.md`, add a row after the `import` row:

```markdown
| `perezdev adopt` | Bring existing hand-written agent configs under management (`-t`, `--mirror`, `-y`, `--dry-run`, `--json`) |
```

- [ ] **Step 2: Add the slash-command row**

In the "Slash commands" table, add after the `/recommend` · `/install` row:

```markdown
| `/adopt [mirror]` | Adopt unmanaged agent configs found on disk (optionally mirror to your tools) |
```

- [ ] **Step 3: Add a short section**

After the "Shareable profiles" section, add:

```markdown
## Adopt existing configs

Already wrote rules by hand? `perezdev adopt` scans each tool for agent/skill files
PerezDev didn't create (Claude `SKILL.md`, Cursor `.mdc`, and the per-agent markdown
of Codex/Copilot/Cline/Windsurf/Roo), reverse-parses them into the canonical spec,
and brings them under management — so `list`, `update`, `remove`, and `profile export`
then cover them too. Adoption is read-only to the source file; add `--mirror <tools|all>`
to also install them into your other tools in their native format.

\`\`\`bash
perezdev adopt --dry-run                 # preview what would be adopted
perezdev adopt -y --mirror all           # adopt everything, mirror across all detected tools
\`\`\`
```

(Use real triple backticks — escaped here only to keep this plan's code fence intact.)

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(adopt): document the adopt command"
```

---

## Self-review

**Spec coverage:**
- Reverse-adapter `discover()` → Tasks 2, 4. ✓
- `DiscoveredItem` type → Task 2. ✓
- Deterministic reverse parser with the exact field rules → Task 5. ✓
- `source: "adopted"` schema change → Task 1. ✓
- Read-only ingest + opt-in mirror via `installSpec` → Task 6 (asserted unchanged source file). ✓
- `discoverAdoptable` / `adoptCandidate` / mirror resolution → Task 6. ✓
- CLI command + flags (`--tool`, `--mirror`, `--dry-run`, `-y`, `--force`, `--json`) → Task 7. ✓
- TUI `/adopt` + registry single-source → Task 8. ✓
- Tests incl. Cursor→Claude round-trip + dry-run-writes-nothing → Tasks 6, 7. ✓
- README → Task 9. ✓
- Cross-3-page consistency (user requirement) → Task 8 (`refresh()` updates rail + F2; per-tool native install via `installSpec`; F3 unaffected by design). ✓

**Decisions honored:** per-agent only (no monolithic blob parsing anywhere); heuristic-only normalization (no provider calls in `core/adopt.ts`); read-only ingest (round-trip test asserts the source file is byte-identical after adopt).

**Deviation from spec, intentional:** the spec's "append `-2` suffix OR set a conflict flag" is resolved to **conflict-flag-and-skip** (lockfile is the source of truth; `--force` overwrites). Within the approved either/or.

**Type consistency:** `AdoptCandidate { spec, sourceTool, sourcePath, conflict }`, `DiscoveredItem { name, tool, path, content }`, `parseAdopted(item, taken)`, `discoverAdoptable({tools?})`, `adoptCandidate(candidate, now, {mirrorTo?, force?})`, `resolveMirrorTargets(arg, source)` — names match across Tasks 5–8. ✓

**Out of scope (unchanged):** MCP-server adoption, monolithic-blob adoption, drift detection — listed as fast-follows in the spec, no tasks here.
