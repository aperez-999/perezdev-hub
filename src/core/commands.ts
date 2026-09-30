import { join } from "node:path";
import { exists, readIfExists } from "../util/fs-safe.js";

/** A command agents should use instead of guessing ("Test: `pnpm test`"). */
export interface RepoCommand {
  label: string;
  command: string;
}

type Ecosystem = { name: string; commands: RepoCommand[] };

const SCRIPT_LABELS: [string[], string][] = [
  [["dev"], "Dev"],
  [["build"], "Build"],
  [["test"], "Test"],
  [["test:e2e", "e2e"], "End-to-end tests"],
  [["lint"], "Lint"],
  [["typecheck", "type-check", "check-types", "tsc"], "Type check"],
  [["format", "fmt"], "Format"],
];

async function node(root: string): Promise<Ecosystem | null> {
  const raw = await readIfExists(join(root, "package.json"));
  if (!raw) return null;
  let pkg: { scripts?: Record<string, string>; packageManager?: string };
  try {
    pkg = JSON.parse(raw);
  } catch {
    return null;
  }
  const declared = pkg.packageManager?.split("@")[0];
  const pm =
    declared && ["npm", "pnpm", "yarn", "bun"].includes(declared)
      ? declared
      : (await exists(join(root, "pnpm-lock.yaml")))
        ? "pnpm"
        : (await exists(join(root, "yarn.lock")))
          ? "yarn"
          : (await exists(join(root, "bun.lock"))) || (await exists(join(root, "bun.lockb")))
            ? "bun"
            : "npm";
  const install = pm === "npm" ? ((await exists(join(root, "package-lock.json"))) ? "npm ci" : "npm install") : `${pm} install`;
  const run = (script: string) => (script === "test" && pm !== "bun" ? `${pm} test` : `${pm} run ${script}`);

  const commands: RepoCommand[] = [{ label: "Install", command: install }];
  const scripts = pkg.scripts ?? {};
  for (const [names, label] of SCRIPT_LABELS) {
    const script = names.find((n) => n in scripts);
    if (script) commands.push({ label, command: run(script) });
  }
  return { name: "Node", commands };
}

async function python(root: string): Promise<Ecosystem | null> {
  const pyproject = (await readIfExists(join(root, "pyproject.toml"))) ?? "";
  const requirements = (await readIfExists(join(root, "requirements.txt"))) ?? "";
  const devReqs = (await readIfExists(join(root, "requirements-dev.txt"))) ?? "";
  if (!pyproject && !requirements) return null;
  const all = `${pyproject}\n${requirements}\n${devReqs}`;

  const [install, prefix] = (await exists(join(root, "uv.lock")))
    ? ["uv sync", "uv run "]
    : (await exists(join(root, "poetry.lock")))
      ? ["poetry install", "poetry run "]
      : requirements
        ? ["pip install -r requirements.txt", ""]
        : ["pip install -e .", ""];
  const commands: RepoCommand[] = [{ label: "Install", command: install }];
  if (/\bpytest\b/.test(all)) commands.push({ label: "Test", command: `${prefix}pytest` });
  if (/\bruff\b/.test(all)) commands.push({ label: "Lint", command: `${prefix}ruff check .` });
  if (/\bmypy\b/.test(all)) commands.push({ label: "Type check", command: `${prefix}mypy .` });
  return { name: "Python", commands };
}

async function go(root: string): Promise<Ecosystem | null> {
  if (!(await exists(join(root, "go.mod")))) return null;
  return {
    name: "Go",
    commands: [
      { label: "Build", command: "go build ./..." },
      { label: "Test", command: "go test ./..." },
      { label: "Lint", command: "go vet ./..." },
    ],
  };
}

async function rust(root: string): Promise<Ecosystem | null> {
  if (!(await exists(join(root, "Cargo.toml")))) return null;
  return {
    name: "Rust",
    commands: [
      { label: "Build", command: "cargo build" },
      { label: "Test", command: "cargo test" },
      { label: "Lint", command: "cargo clippy --all-targets" },
      { label: "Format", command: "cargo fmt" },
    ],
  };
}

/** Make targets fill gaps the language tooling didn't cover. */
async function make(root: string, covered: Set<string>): Promise<Ecosystem | null> {
  const makefile = await readIfExists(join(root, "Makefile"));
  if (!makefile) return null;
  const targets: [string, string][] = [["build", "Build"], ["test", "Test"], ["lint", "Lint"], ["fmt", "Format"], ["format", "Format"]];
  const commands = targets
    .filter(([t, label]) => !covered.has(label) && new RegExp(`^${t}:`, "m").test(makefile))
    .map(([t, label]) => ({ label, command: `make ${t}` }));
  return commands.length > 0 ? { name: "Make", commands } : null;
}

/** Build, test, and lint commands for the repo at `root`, from its manifests. Deterministic; runs nothing. */
export async function detectCommands(root: string): Promise<RepoCommand[]> {
  const found = (await Promise.all([node(root), python(root), go(root), rust(root)])).filter((e): e is Ecosystem => e !== null);
  const extra = await make(root, new Set(found.flatMap((e) => e.commands.map((c) => c.label))));
  if (extra) found.push(extra);
  // With more than one language, say which one each command is for.
  const tag = found.filter((e) => e.name !== "Make").length > 1;
  return found.flatMap((e) => e.commands.map((c) => (tag && e.name !== "Make" ? { ...c, label: `${c.label} (${e.name})` } : c)));
}
