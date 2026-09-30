import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { commit, planChanges } from "../src/core/install.js";
import { diagnose, summarize } from "../src/core/doctor.js";
import { fetchSource, findSkills, originOf, parseSource, skillToSpec, untar, type SourceTree } from "../src/core/sources.js";
import { exists } from "../src/util/fs-safe.js";
import { useSandbox } from "./helpers.js";

const box = useSandbox();
afterEach(() => vi.unstubAllGlobals());

/** Build a ustar archive the way `git archive` does: pax global header with the commit, pax path records for long names. */
function tarball(files: Record<string, string>, commit = "a".repeat(40)): Buffer {
  const blocks: Buffer[] = [];
  const pad = (b: Buffer) => Buffer.concat([b, Buffer.alloc((512 - (b.length % 512)) % 512)]);
  const header = (name: string, size: number, type: string) => {
    const h = Buffer.alloc(512);
    h.write(name.slice(0, 99), 0);
    h.write("0000644\0", 100);
    h.write(size.toString(8).padStart(11, "0") + "\0", 124);
    h.write(type, 156);
    h.write("ustar\0", 257);
    h.write("00", 263);
    h.fill(" ", 148, 156);
    let sum = 0;
    for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
    return h;
  };
  // A pax record is "<len> key=value\n", where <len> counts its own digits too.
  const pax = (key: string, value: string) => {
    const body = ` ${key}=${value}\n`;
    let len = body.length + 1;
    while (String(len).length + body.length !== len) len++;
    return Buffer.from(`${len}${body}`);
  };
  const g = pax("comment", commit);
  blocks.push(header("pax_global_header", g.length, "g"), pad(g));
  for (const [path, text] of Object.entries(files)) {
    const full = `owner-repo-${commit.slice(0, 7)}/${path}`;
    const data = Buffer.from(text);
    if (full.length > 99) {
      const x = pax("path", full);
      blocks.push(header("PaxHeader", x.length, "x"), pad(x));
    }
    blocks.push(header(full, data.length, "0"), pad(data));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const skillMd = (name: string, description: string, body = "# Title\n\nDo the thing.\n") =>
  `---\nname: ${name}\ndescription: ${description}\nlicense: MIT\n---\n${body}`;

describe("parseSource", () => {
  it("reads GitHub shorthands, URLs, and refs", async () => {
    expect(await parseSource("anthropics/skills")).toEqual({ kind: "github", owner: "anthropics", repo: "skills", path: "", ref: undefined });
    expect(await parseSource("github:obra/superpowers/skills/brainstorming@v4.0.3")).toEqual({
      kind: "github",
      owner: "obra",
      repo: "superpowers",
      path: "skills/brainstorming",
      ref: "v4.0.3",
    });
    expect(await parseSource("https://github.com/anthropics/skills/tree/main/skills/pdf")).toEqual({
      kind: "github",
      owner: "anthropics",
      repo: "skills",
      ref: "main",
      path: "skills/pdf",
    });
  });

  it("treats paths and existing folders as local", async () => {
    await mkdir(join(box.repo, "skills"));
    expect(await parseSource("./skills", box.repo)).toEqual({ kind: "local", dir: join(box.repo, "skills") });
    expect(await parseSource("skills", box.repo)).toEqual({ kind: "local", dir: join(box.repo, "skills") });
  });
});

describe("untar", () => {
  it("reads git-archive tarballs, including the commit and long paths", async () => {
    const long = `skills/${"deep/".repeat(20)}file.md`;
    const { files, comment } = untar((await import("node:zlib")).gunzipSync(tarball({ "README.md": "hi", [long]: "long" })));
    expect(comment).toBe("a".repeat(40));
    expect(files.get(`owner-repo-aaaaaaa/${long}`)?.toString()).toBe("long");
  });
});

describe("findSkills", () => {
  const tree = (files: Record<string, string>): SourceTree => ({ files: new Map(Object.entries(files)), skipped: [] });

  it("finds skill folders, keeps their own files, and leaves nested skills separate", () => {
    const { skills, problems } = findSkills(
      tree({
        "skills/pdf/SKILL.md": skillMd("pdf", "Use when working with PDF files."),
        "skills/pdf/scripts/fill.py": "print('x')\n",
        "skills/pdf/forms/SKILL.md": skillMd("pdf-forms", "Use when filling PDF forms."),
        "skills/broken/SKILL.md": "no frontmatter",
        "README.md": "repo readme",
      }),
    );
    expect(skills.map((s) => [s.name, Object.keys(s.resources)])).toEqual([
      ["pdf", ["scripts/fill.py"]],
      ["pdf-forms", []],
    ]);
    expect(problems).toEqual([{ dir: "skills/broken", reason: "SKILL.md has no frontmatter" }]);
  });

  it("parses real YAML: block-scalar descriptions and string tool lists", () => {
    const md = "---\nname: review\ndescription: >-\n  Use when reviewing\n  pull requests.\nallowed-tools: Read Grep Bash(git diff:*)\n---\nBody\n";
    const [skill] = findSkills(tree({ "SKILL.md": md })).skills;
    expect(skill!.description).toBe("Use when reviewing pull requests.");
    expect(skill!.allowedTools).toEqual(["Read", "Grep", "Bash(git diff:*)"]);
  });
});

describe("adding skills", () => {
  it("installs a GitHub skill verbatim with its files, pinned to the commit", async () => {
    const original = skillMd("pdf", "Use when working with PDF files.");
    const fetchMock = vi.fn(async () => new Response(tarball({ "skills/pdf/SKILL.md": original, "skills/pdf/scripts/fill.py": "#!/usr/bin/env python3\nprint(1)\n" })));
    vi.stubGlobal("fetch", fetchMock);

    const src = await parseSource("acme/skills/skills/pdf@main");
    const tree = await fetchSource(src);
    expect(String((fetchMock.mock.calls as unknown[][])[0]![0])).toBe("https://api.github.com/repos/acme/skills/tarball/main");
    const [skill] = findSkills(tree).skills;
    const spec = skillToSpec(skill!, originOf(src, skill!, tree, box.repo), ["claude-code", "cline"]);
    expect(spec.origin).toEqual({ source: "github:acme/skills", path: "skills/pdf", ref: "main", commit: "a".repeat(40) });

    const plan = await commit(box.project, { agents: [spec] });
    expect(plan.skipped.map((s) => s.tool)).toEqual(["cline"]); // rule tools can't hold bundled files
    expect(await readFile(join(box.repo, ".claude/skills/pdf/SKILL.md"), "utf8")).toBe(original);
    const script = join(box.repo, ".claude/skills/pdf/scripts/fill.py");
    expect(await readFile(script, "utf8")).toBe("#!/usr/bin/env python3\nprint(1)\n");
    expect((await stat(script)).mode & 0o111).not.toBe(0);
    expect(await readFile(join(box.repo, ".clinerules/pdf.md"), "utf8")).toContain("**Use when working with PDF files.**");
    expect(summarize(await diagnose(box.project)).ok).toBe(true);
  });

  it("treats files it recorded as its own on upgrade and removal — no conflicts, no leftovers", async () => {
    const dir = join(box.repo, "vendor/review");
    await mkdir(join(dir, "ref"), { recursive: true });
    await writeFile(join(dir, "SKILL.md"), skillMd("review", "Use when reviewing code."));
    await writeFile(join(dir, "ref/checklist.md"), "- one\n");
    const add = async () => {
      const src = await parseSource("./vendor/review", box.repo);
      const tree = await fetchSource(src);
      const [skill] = findSkills(tree).skills;
      return skillToSpec(skill!, originOf(src, skill!, tree, box.repo), ["claude-code"]);
    };

    await commit(box.project, { agents: [await add()] });
    expect((await add()).origin).toEqual({ source: "file:vendor/review", path: "" });

    // Upstream drops a file and edits another: re-adding updates in place, without conflicts.
    await writeFile(join(dir, "ref/checklist.md"), "- one\n- two\n");
    const plan = await planChanges(box.project, { agents: [await add()] });
    expect(plan.conflicts).toEqual([]);
    expect(plan.writes.map((w) => w.path)).toEqual([join(box.repo, ".claude/skills/review/ref/checklist.md")]);

    await commit(box.project, { removeAgents: ["review"] });
    expect(await exists(join(box.repo, ".claude/skills/review"))).toBe(false);
    expect(await exists(join(box.repo, ".claude"))).toBe(false); // emptied folders in a repo are pruned
  });
});
