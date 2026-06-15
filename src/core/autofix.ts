import type { Diagnosis } from "../tui/data.js";
import type { Edit } from "../util/fs-safe.js";
import type { ProjectScan } from "./scan.js";
import type { ExecResult } from "./exec.js";
import { fixPrompt, parseFixAction } from "./fix-prompt.js";

/** Guess the command that re-runs the failing code, from the error and project stack. */
export function inferVerifyCommand(diagnosis: Diagnosis, scan?: ProjectScan): string {
  const file = diagnosis.frames[0]?.file ?? "";
  const tests = scan?.testFrameworks ?? [];
  if (/\.py$/.test(file)) return tests.includes("pytest") ? "pytest" : `python ${file}`;
  if (/\.(t|j)sx?$/.test(file)) return tests[0] ? "npm test" : `node ${file}`;
  if (tests.includes("pytest") || scan?.languages.includes("python")) return "pytest";
  if (tests.length || scan?.languages.includes("node")) return "npm test";
  return file ? `cat ${file}` : "";
}

export type LogFn = (kind: "info" | "ok" | "err", text: string) => void;

export interface AutofixDeps {
  /** Ask the active LLM (local or cloud). */
  callProvider: (prompt: string) => Promise<string>;
  /** Run the verify command (denylist-guarded; operator-supplied). */
  exec: (command: string) => Promise<ExecResult>;
  /** Run an LLM-proposed dependency install (allowlisted, shell-free). */
  execInstall: (command: string) => Promise<ExecResult>;
  /** Read a file's contents (null if missing). */
  readFile: (path: string) => Promise<string | null>;
  /** Apply edits to a file under backup/rollback; returns ok or an error message. */
  applyPatch: (file: string, edits: Edit[]) => Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * Gate a mutating action (Y/N). `kind` lets the caller apply a stricter policy
   * to shell-executing installs (e.g. never auto-approve under `--yes`). Resolves
   * false to abort the loop.
   */
  confirm: (desc: string, kind: "install" | "patch") => Promise<boolean>;
  log: LogFn;
}

export interface AutofixInput {
  diagnosis: Diagnosis;
  verifyCommand: string;
  maxAttempts?: number;
}

export type AutofixStatus = "fixed" | "exhausted" | "cancelled" | "stopped";

export interface AutofixResult {
  status: AutofixStatus;
  attempts: number;
  changedFiles: string[];
  commandsRun: string[];
}

/** Read a few lines around `line` for context. */
function snippet(text: string | null, line: number, radius = 8): string | null {
  if (!text) return null;
  const lines = text.split("\n");
  const start = Math.max(0, line - radius - 1);
  const end = Math.min(lines.length, line + radius);
  return lines
    .slice(start, end)
    .map((l, i) => `${start + i + 1 === line ? ">" : " "} ${start + i + 1} | ${l}`)
    .join("\n");
}

/** First line of a snippet, truncated, for a compact diff preview. */
function snip(s: string): string {
  const first = s.split("\n")[0] ?? "";
  return first.length > 60 ? first.slice(0, 57) + "..." : first;
}

function passed(out: ExecResult, errorSignature: string): boolean {
  if (out.code !== 0) return false;
  const sig = errorSignature.trim();
  const haystack = (out.stdout + "\n" + out.stderr).trim();
  return sig.length === 0 || !haystack.includes(sig);
}

/**
 * Closed auto-fix loop: ask the model for one action, apply it (gated), re-run the
 * verify command, and repeat until the error clears or the attempt cap is hit. All
 * I/O is injected, so this is pure orchestration and fully unit-testable.
 */
export async function runAutofix(input: AutofixInput, deps: AutofixDeps): Promise<AutofixResult> {
  const max = input.maxAttempts ?? 3;
  const { diagnosis, verifyCommand } = input;
  const changedFiles = new Set<string>();
  const commandsRun: string[] = [];
  let lastOutput: string | undefined;

  const frame = diagnosis.frames[0];
  const fileText = frame ? await deps.readFile(frame.file) : null;
  const code = frame ? snippet(fileText, frame.line) : null;

  for (let attempt = 1; attempt <= max; attempt++) {
    deps.log("info", `attempt ${attempt}/${max}: asking the model for a fix...`);
    let action;
    try {
      const raw = await deps.callProvider(
        fixPrompt({ diagnosis, snippet: code, verifyCommand, lastOutput, attempt, maxAttempts: max }),
      );
      action = parseFixAction(raw);
    } catch (e) {
      deps.log("err", `couldn't read a fix from the model: ${e instanceof Error ? e.message : String(e)}`);
      lastOutput = "(previous reply was not a valid action; reply with one raw JSON action)";
      continue;
    }

    if (action.kind === "done") {
      deps.log("info", `model stopped: ${action.reason ?? "no further action"}`);
      return { status: "stopped", attempts: attempt, changedFiles: [...changedFiles], commandsRun };
    }

    if (action.kind === "install") {
      if (!(await deps.confirm(`run install: ${action.command}`, "install"))) {
        return { status: "cancelled", attempts: attempt, changedFiles: [...changedFiles], commandsRun };
      }
      const r = await deps.execInstall(action.command);
      commandsRun.push(action.command);
      if (r.blocked) deps.log("err", r.blocked);
      else deps.log("info", `ran: ${action.command} (exit ${r.code})`);
    } else if (action.kind === "patch") {
      const head = `patch ${action.file} (${action.edits.length} edit${action.edits.length > 1 ? "s" : ""})${action.reason ? ` — ${action.reason}` : ""}`;
      const preview = action.edits
        .slice(0, 2)
        .map((e) => `  - ${snip(e.find)}\n  + ${snip(e.replace)}`)
        .join("\n");
      const desc = `${head}\n${preview}`;
      if (!(await deps.confirm(desc, "patch"))) {
        return { status: "cancelled", attempts: attempt, changedFiles: [...changedFiles], commandsRun };
      }
      const applied = await deps.applyPatch(action.file, action.edits);
      if (!applied.ok) {
        deps.log("err", `patch failed: ${applied.error}`);
        lastOutput = `patch did not apply: ${applied.error}`;
        continue;
      }
      changedFiles.add(action.file);
      deps.log("ok", `patched ${action.file}`);
    }
    // action.kind === "verify" falls through to the verify run below.

    const out = await deps.exec(verifyCommand);
    commandsRun.push(verifyCommand);
    lastOutput = (out.stdout + "\n" + out.stderr).trim();
    if (passed(out, diagnosis.message)) {
      deps.log("ok", `verify passed (exit ${out.code}) — error resolved`);
      return { status: "fixed", attempts: attempt, changedFiles: [...changedFiles], commandsRun };
    }
    deps.log("info", `verify still failing (exit ${out.code}); iterating...`);
  }

  deps.log("err", `gave up after ${max} attempts`);
  return { status: "exhausted", attempts: max, changedFiles: [...changedFiles], commandsRun };
}
