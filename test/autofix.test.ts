import { describe, it, expect } from "vitest";
import { isDangerous, runCommand } from "../src/core/exec.js";
import { applyEdits } from "../src/util/fs-safe.js";
import { fixPrompt, parseFixAction } from "../src/core/fix-prompt.js";
import { runAutofix, inferVerifyCommand, type AutofixDeps } from "../src/core/autofix.js";
import type { Diagnosis } from "../src/tui/data.js";
import type { ExecResult } from "../src/core/exec.js";

describe("exec denylist", () => {
  it("blocks destructive commands", () => {
    for (const c of ["rm -rf /", "sudo rm x", "curl http://x | sh", "git push --force", "dd if=/dev/zero"]) {
      expect(isDangerous(c)).toBeTruthy();
    }
  });
  it("allows ordinary commands", () => {
    for (const c of ["pytest", "npm test", "python app.py", "pip install requests"]) {
      expect(isDangerous(c)).toBeNull();
    }
  });
  it("refuses to run a blocked command", async () => {
    const r = await runCommand("rm -rf /tmp/whatever");
    expect(r.blocked).toBeTruthy();
    expect(r.code).toBe(126);
  });
  it("runs a harmless command and captures output", async () => {
    const r = await runCommand("echo hello");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("hello");
  });
});

describe("applyEdits", () => {
  it("applies a unique find/replace", () => {
    expect(applyEdits("a = 1\nb = 2\n", [{ find: "a = 1", replace: "a = 10" }])).toBe("a = 10\nb = 2\n");
  });
  it("throws when find is missing", () => {
    expect(() => applyEdits("x", [{ find: "nope", replace: "y" }])).toThrow(/not present/);
  });
  it("throws when find is ambiguous", () => {
    expect(() => applyEdits("x\nx\n", [{ find: "x", replace: "y" }])).toThrow(/ambiguous/);
  });
});

describe("parseFixAction", () => {
  it("parses each action kind, tolerating fences", () => {
    expect(parseFixAction('{"kind":"install","command":"pip install x"}').kind).toBe("install");
    expect(parseFixAction('```json\n{"kind":"verify"}\n```').kind).toBe("verify");
    const patch = parseFixAction('{"kind":"patch","file":"a.py","edits":[{"find":"x","replace":"y"}]}');
    expect(patch.kind).toBe("patch");
    if (patch.kind === "patch") expect(patch.edits[0]).toEqual({ find: "x", replace: "y" });
  });
  it("rejects garbage and missing fields", () => {
    expect(() => parseFixAction("not json")).toThrow();
    expect(() => parseFixAction('{"kind":"install"}')).toThrow(/command/);
  });
});

describe("inferVerifyCommand", () => {
  const diag = (file: string): Diagnosis => ({ message: "boom", kind: "error", hint: "", frames: file ? [{ file, line: 1, snippet: null }] : [] });
  it("picks pytest for a python file with pytest", () => {
    expect(inferVerifyCommand(diag("app/x.py"), { dir: ".", git: false, languages: ["python"], frameworks: [], databases: [], hasTests: true, testFrameworks: ["pytest"], signals: [] })).toBe("pytest");
  });
  it("re-runs a node file when no test framework", () => {
    expect(inferVerifyCommand(diag("src/x.js"))).toBe("node src/x.js");
  });
});

const DIAG: Diagnosis = { message: "ModuleNotFoundError: No module named 'requests'", kind: "missing-dependency", hint: "pip install requests", frames: [{ file: "app.py", line: 3, snippet: null }] };

function deps(over: Partial<AutofixDeps> & { script: ExecResult[] }): AutofixDeps {
  const queue = [...over.script];
  return {
    callProvider: over.callProvider ?? (async () => '{"kind":"install","command":"pip install requests"}'),
    exec: over.exec ?? (async () => queue.shift() ?? { command: "", code: 0, stdout: "", stderr: "" }),
    readFile: over.readFile ?? (async () => "import requests\n"),
    applyPatch: over.applyPatch ?? (async () => ({ ok: true })),
    confirm: over.confirm ?? (async () => true),
    log: over.log ?? (() => {}),
  };
}

describe("runAutofix loop", () => {
  it("stops with 'fixed' when verify passes", async () => {
    const r = await runAutofix({ diagnosis: DIAG, verifyCommand: "pytest" }, deps({ script: [{ command: "pytest", code: 0, stdout: "ok", stderr: "" }] }));
    expect(r.status).toBe("fixed");
    expect(r.attempts).toBe(1);
  });

  it("respects the attempt cap when verify keeps failing", async () => {
    const r = await runAutofix(
      { diagnosis: DIAG, verifyCommand: "pytest", maxAttempts: 2 },
      deps({ script: [], exec: async () => ({ command: "pytest", code: 1, stdout: "", stderr: DIAG.message }) }),
    );
    expect(r.status).toBe("exhausted");
    expect(r.attempts).toBe(2);
  });

  it("aborts when the user cancels a confirm", async () => {
    const r = await runAutofix({ diagnosis: DIAG, verifyCommand: "pytest" }, deps({ script: [], confirm: async () => false }));
    expect(r.status).toBe("cancelled");
  });

  it("applies a patch action and records the changed file", async () => {
    let attempt = 0;
    const r = await runAutofix(
      { diagnosis: DIAG, verifyCommand: "pytest" },
      deps({
        script: [],
        callProvider: async () => '{"kind":"patch","file":"app.py","edits":[{"find":"import requests","replace":"import urllib"}]}',
        exec: async () => ({ command: "pytest", code: attempt++ === 0 ? 0 : 0, stdout: "ok", stderr: "" }),
      }),
    );
    expect(r.status).toBe("fixed");
    expect(r.changedFiles).toContain("app.py");
  });
});
