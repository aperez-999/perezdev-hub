import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanProject } from "../src/core/scan.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "scan-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("scanProject stack detection", () => {
  it("names test frameworks and tags redis", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ dependencies: { react: "18", ioredis: "5" }, devDependencies: { vitest: "1", typescript: "5" } }),
    );
    const scan = await scanProject(dir);
    expect(scan.frameworks).toContain("react");
    expect(scan.databases).toContain("redis");
    expect(scan.testFrameworks).toContain("vitest");
    expect(scan.languages).toContain("typescript");
    expect(scan.signals).toContain("vitest");
  });

  it("detects a Ruby/Rails project from the Gemfile", async () => {
    await writeFile(join(dir, "Gemfile"), 'gem "rails"\ngem "pg"\ngem "rspec"\n');
    const scan = await scanProject(dir);
    expect(scan.languages).toContain("ruby");
    expect(scan.frameworks).toContain("rails");
    expect(scan.databases).toContain("postgres");
    expect(scan.testFrameworks).toContain("rspec");
  });
});
