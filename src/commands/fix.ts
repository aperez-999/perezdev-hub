import pc from "picocolors";
import { readIfExists } from "../util/fs-safe.js";
import { engineRequest } from "../engine/bridge.js";

interface Diagnosis {
  message: string;
  kind: string;
  hint: string;
  frames: { file: string; line: number; snippet: string | null }[];
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** Diagnose a traceback from a file or piped stdin via the Python engine. */
export async function runFix(file?: string): Promise<void> {
  const text = file ? (await readIfExists(file)) ?? "" : await readStdin();
  if (!text.trim()) {
    console.error(pc.red("Provide a log file (perezdev fix <file>) or pipe a traceback into it."));
    process.exit(1);
  }

  let d: Diagnosis;
  try {
    d = await engineRequest<Diagnosis>("diagnose", { text });
  } catch (err) {
    console.error(pc.red(`engine error: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }

  console.log();
  console.log(`  ${pc.bold(pc.red(d.kind))}  ${d.message}`);
  console.log(`  ${pc.green("→")} ${d.hint}\n`);
  for (const f of d.frames) {
    console.log(`  ${pc.cyan(`${f.file}:${f.line}`)}`);
    if (f.snippet) console.log(f.snippet.split("\n").map((l) => pc.dim(`    ${l}`)).join("\n"));
    console.log();
  }
  if (d.frames.length === 0) console.log(pc.dim("  (no local source frames found in the trace)\n"));
}
