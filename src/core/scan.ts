import { readIfExists, exists } from "../util/fs-safe.js";
import { join } from "node:path";

/** Signals detected about the project in the current directory. */
export interface ProjectScan {
  dir: string;
  git: boolean;
  languages: string[];
  frameworks: string[];
  databases: string[];
  hasTests: boolean;
  /** Human-readable summary chips. */
  signals: string[];
}

const FRAMEWORK_DEPS: Record<string, string> = {
  react: "react",
  next: "next",
  vue: "vue",
  svelte: "svelte",
  "@angular/core": "angular",
  express: "express",
  fastify: "fastify",
  "@nestjs/core": "nest",
  koa: "koa",
};
const DB_DEPS: Record<string, string> = {
  pg: "postgres",
  postgres: "postgres",
  "pg-promise": "postgres",
  prisma: "postgres",
  "@prisma/client": "postgres",
  mysql: "mysql",
  mysql2: "mysql",
  sqlite3: "sqlite",
  "better-sqlite3": "sqlite",
  mongodb: "mongo",
  mongoose: "mongo",
};
const TEST_DEPS = ["jest", "vitest", "mocha", "@playwright/test", "cypress", "ava", "jasmine"];

/** Scan the project directory for languages, frameworks, databases, and tests. */
export async function scanProject(dir: string = process.cwd()): Promise<ProjectScan> {
  const scan: ProjectScan = {
    dir,
    git: await exists(join(dir, ".git")),
    languages: [],
    frameworks: [],
    databases: [],
    hasTests: false,
    signals: [],
  };

  // Node / TypeScript
  const pkgRaw = await readIfExists(join(dir, "package.json"));
  if (pkgRaw) {
    scan.languages.push("node");
    if (await exists(join(dir, "tsconfig.json"))) scan.languages.push("typescript");
    try {
      const pkg = JSON.parse(pkgRaw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      for (const [dep, label] of Object.entries(FRAMEWORK_DEPS)) if (deps[dep]) push(scan.frameworks, label);
      for (const [dep, label] of Object.entries(DB_DEPS)) if (deps[dep]) push(scan.databases, label);
      if (TEST_DEPS.some((t) => deps[t])) scan.hasTests = true;
    } catch {
      /* ignore malformed package.json */
    }
  }

  // Python
  const pyText =
    (await readIfExists(join(dir, "requirements.txt"))) ??
    (await readIfExists(join(dir, "pyproject.toml"))) ??
    (await readIfExists(join(dir, "Pipfile")));
  if (pyText) {
    scan.languages.push("python");
    const t = pyText.toLowerCase();
    if (/fastapi/.test(t)) push(scan.frameworks, "fastapi");
    if (/django/.test(t)) push(scan.frameworks, "django");
    if (/\bflask\b/.test(t)) push(scan.frameworks, "flask");
    if (/psycopg|sqlalchemy|asyncpg/.test(t)) push(scan.databases, "postgres");
    if (/\bsqlite\b/.test(t)) push(scan.databases, "sqlite");
    if (/pytest|unittest/.test(t)) scan.hasTests = true;
  }

  // Other languages
  if (await exists(join(dir, "go.mod"))) scan.languages.push("go");
  if (await exists(join(dir, "Cargo.toml"))) scan.languages.push("rust");
  if ((await exists(join(dir, "pom.xml"))) || (await exists(join(dir, "build.gradle")))) scan.languages.push("java");

  scan.signals = [
    ...(scan.git ? ["git"] : []),
    ...scan.languages,
    ...scan.frameworks,
    ...scan.databases.map((d) => `db:${d}`),
    ...(scan.hasTests ? ["tests"] : []),
  ];
  return scan;
}

function push(arr: string[], v: string): void {
  if (!arr.includes(v)) arr.push(v);
}
