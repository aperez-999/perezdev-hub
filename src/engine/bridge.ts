import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Locate engine.py whether running from dist/ or src/ (tsx). */
function enginePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const rel of ["../python/engine.py", "../../python/engine.py", "python/engine.py"]) {
    const p = join(here, rel);
    if (existsSync(p)) return p;
  }
  return join(here, "../python/engine.py");
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Persistent bridge to the local Python engine. Serializes requests over
 * stdin/stdout, correlates responses by id, and never lets an engine error
 * crash the Node process — failures surface as rejected promises.
 */
export class Engine {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: Interface | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private deadError: Error | null = null;

  private start(): void {
    if (this.proc) return;
    const cmd = process.env.PEREZDEV_PYTHON || "python3";
    const proc = spawn(cmd, [enginePath()], { stdio: ["pipe", "pipe", "pipe"] });
    this.proc = proc;

    proc.on("error", (err) => this.fail(new Error(`python engine unavailable (${cmd}): ${err.message}`)));
    proc.on("exit", (code) => {
      if (this.pending.size > 0) this.fail(new Error(`python engine exited (code ${code ?? "?"})`));
    });

    this.rl = createInterface({ input: proc.stdout });
    this.rl.on("line", (line) => this.onLine(line));
  }

  private onLine(line: string): void {
    let msg: { id?: number; ok?: boolean; result?: unknown; error?: string };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof msg.id !== "number") return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error || "engine error"));
  }

  private fail(err: Error): void {
    this.deadError = err;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  /** Send an op and await its structured result. */
  send<T = unknown>(op: string, params: Record<string, unknown> = {}, timeoutMs = 15000): Promise<T> {
    this.start();
    if (this.deadError) return Promise.reject(this.deadError);
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`engine timeout after ${timeoutMs}ms (${op})`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.proc!.stdin.write(JSON.stringify({ id, op, params }) + "\n");
    });
  }

  close(): void {
    this.rl?.close();
    this.proc?.stdin.end();
    this.proc?.kill();
    this.proc = null;
  }
}

/** One-shot helper: start an engine, run a single op, shut it down. */
export async function engineRequest<T = unknown>(
  op: string,
  params: Record<string, unknown> = {},
  timeoutMs = 15000,
): Promise<T> {
  const engine = new Engine();
  try {
    return await engine.send<T>(op, params, timeoutMs);
  } finally {
    engine.close();
  }
}
