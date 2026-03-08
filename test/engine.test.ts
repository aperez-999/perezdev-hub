import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { Engine, engineRequest } from "../src/engine/bridge.js";

const hasPython = (() => {
  try {
    execSync("python3 --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.runIf(hasPython)("Python engine bridge", () => {
  it("ping round-trips", async () => {
    const res = await engineRequest<{ pong: boolean }>("ping");
    expect(res.pong).toBe(true);
  });

  it("diagnose classifies a missing-dependency traceback", async () => {
    const text = `Traceback (most recent call last):\n  File "x.py", line 1\nModuleNotFoundError: No module named 'requests'`;
    const res = await engineRequest<{ kind: string; hint: string }>("diagnose", { text });
    expect(res.kind).toBe("missing-dependency");
    expect(res.hint).toMatch(/pip install requests/);
  });

  it("reuses one process across calls and reports unknown ops", async () => {
    const engine = new Engine();
    expect((await engine.send<{ pong: boolean }>("ping")).pong).toBe(true);
    await expect(engine.send("bogus")).rejects.toThrow(/unknown op/);
    engine.close();
  });

  it("surfaces a readable error when python is missing", async () => {
    const prev = process.env.PEREZDEV_PYTHON;
    process.env.PEREZDEV_PYTHON = "definitely-not-python-xyz";
    await expect(engineRequest("ping", {}, 3000)).rejects.toThrow(/unavailable|ENOENT/i);
    if (prev === undefined) delete process.env.PEREZDEV_PYTHON;
    else process.env.PEREZDEV_PYTHON = prev;
  });
});
