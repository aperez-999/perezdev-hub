import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheBackup, atomicWriteValidated, validateJson, withRollback, exists } from "../src/util/fs-safe.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "pdh-safe-"));
  process.env.HOME = home;
  delete process.env.XDG_CONFIG_HOME;
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("safeguards", () => {
  it("cacheBackup writes a timestamped copy into the app cache", async () => {
    const f = join(home, "mcp.json");
    await writeFile(f, "{}");
    const bak = await cacheBackup(f, "2026-06-13T00:00:00.000Z");
    expect(bak).toMatch(/\.config\/perezdev\/backups\/mcp\.json\..*\.bak$/);
    const list = await readdir(join(home, ".config", "perezdev", "backups"));
    expect(list.length).toBe(1);
  });

  it("atomicWriteValidated rejects invalid JSON before touching the target", async () => {
    const f = join(home, "out.json");
    await expect(atomicWriteValidated(f, "{not json", validateJson)).rejects.toThrow();
    expect(await exists(f)).toBe(false);
    await atomicWriteValidated(f, '{"ok":true}', validateJson);
    expect(JSON.parse(await readFile(f, "utf8")).ok).toBe(true);
  });

  it("withRollback restores a modified file when the task throws", async () => {
    const f = join(home, "settings.json");
    await writeFile(f, '{"v":1}');
    await expect(
      withRollback([f], "2026-06-13T00:00:00.000Z", async () => {
        await writeFile(f, '{"v":2,"broken":');
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(JSON.parse(await readFile(f, "utf8")).v).toBe(1);
  });

  it("withRollback deletes a newly-created file on failure", async () => {
    const f = join(home, "new.json");
    await expect(
      withRollback([f], "2026-06-13T00:00:00.000Z", async () => {
        await writeFile(f, "partial");
        throw new Error("nope");
      }),
    ).rejects.toThrow();
    expect(await exists(f)).toBe(false);
  });
});
