import pc from "picocolors";
import * as p from "@clack/prompts";
import { readIfExists, applyEdits, cacheBackup, atomicWriteValidated, withRollback } from "../util/fs-safe.js";
import { engineRequest, Engine } from "../engine/bridge.js";
import { scanProject } from "../core/scan.js";
import { runCommand } from "../core/exec.js";
import { promptActiveProvider } from "../core/provider-call.js";
import { detectOllama } from "../core/ollama.js";
import { resolveProvider, providerHint } from "../core/provider.js";
import { runAutofix, inferVerifyCommand } from "../core/autofix.js";
import type { Diagnosis } from "../tui/data.js";

interface AutofixOptions {
  verify?: string;
  yes?: boolean;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** Diagnose a traceback, then run the gated patch + verify loop until it passes. */
export async function runAutofixCommand(file?: string, opts: AutofixOptions = {}): Promise<void> {
  const text = file ? (await readIfExists(file)) ?? "" : await readStdin();
  if (!text.trim()) {
    console.error(pc.red("Provide a log file (perezdev autofix <file>) or pipe a traceback into it."));
    process.exit(1);
  }

  const d = await engineRequest<Diagnosis>("diagnose", { text });
  if (d.frames.length === 0 && !d.hint) {
    console.error(pc.red("Couldn't localize the error — need a traceback with a file/line or a known cause."));
    process.exit(1);
  }

  const scan = await scanProject();
  const verify = opts.verify || inferVerifyCommand(d, scan);
  if (!verify) {
    console.error(pc.red("Couldn't infer a verify command — pass one with --verify '<command>'."));
    process.exit(1);
  }

  console.log(`\n  ${pc.bold(pc.red(d.kind))}  ${d.message}`);
  console.log(`  verify: ${pc.cyan(verify)}\n`);

  const engine = new Engine();
  // Fail fast if no model backend is reachable, instead of looping on errors.
  const prov = resolveProvider(await detectOllama(engine));
  if (prov.kind === "none") {
    console.error(pc.red(providerHint(prov)));
    engine.close();
    process.exit(1);
  }
  try {
    const result = await runAutofix(
      { diagnosis: d, verifyCommand: verify },
      {
        callProvider: (prompt) => promptActiveProvider(engine, prompt),
        exec: (c) => runCommand(c, { cwd: process.cwd() }),
        readFile: (path) => readIfExists(path),
        applyPatch: async (target, edits) => {
          try {
            const cur = await readIfExists(target);
            if (cur === null) return { ok: false, error: `file not found: ${target}` };
            const next = applyEdits(cur, edits);
            const stamp = new Date().toISOString();
            await withRollback([target], stamp, async () => {
              await cacheBackup(target, stamp);
              await atomicWriteValidated(target, next);
            });
            return { ok: true };
          } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
        confirm: async (desc) => {
          if (opts.yes) return true;
          const ok = await p.confirm({ message: desc });
          return ok === true;
        },
        log: (kind, t) => {
          const mark = kind === "ok" ? pc.green("✓") : kind === "err" ? pc.red("✗") : pc.cyan("•");
          console.log(`  ${mark} ${t}`);
        },
      },
    );
    const color = result.status === "fixed" ? pc.green : pc.yellow;
    console.log(
      `\n  ${color(`autofix ${result.status}`)} — ${result.attempts} attempt(s), ${result.changedFiles.length} file(s) changed.`,
    );
    if (result.changedFiles.length) console.log(`  changed: ${result.changedFiles.join(", ")}`);
    if (result.status !== "fixed") process.exitCode = 1;
  } finally {
    engine.close();
  }
}
