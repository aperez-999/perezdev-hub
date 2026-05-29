import type { Edit } from "../util/fs-safe.js";
import type { Diagnosis } from "../tui/data.js";

export type FixAction =
  | { kind: "install"; command: string; reason?: string }
  | { kind: "patch"; file: string; edits: Edit[]; reason?: string }
  | { kind: "verify"; reason?: string }
  | { kind: "done"; reason?: string };

/** Build the metaprompt asking the model for ONE next fix action as raw JSON. */
export function fixPrompt(args: {
  diagnosis: Diagnosis;
  snippet: string | null;
  verifyCommand: string;
  lastOutput?: string;
  attempt: number;
  maxAttempts: number;
}): string {
  const { diagnosis, snippet, verifyCommand, lastOutput, attempt, maxAttempts } = args;
  const frame = diagnosis.frames[0];
  return [
    "You are an expert debugging agent fixing a failing program. Work in small, verifiable steps.",
    "",
    `Error (${diagnosis.kind}): ${diagnosis.message}`,
    diagnosis.hint ? `Hint: ${diagnosis.hint}` : "",
    frame ? `Offending file: ${frame.file} (around line ${frame.line})` : "",
    snippet ? `\nRelevant code:\n${snippet}` : "",
    lastOutput ? `\nOutput from the last verify run:\n${lastOutput.slice(-1500)}` : "",
    `\nThe verify command is: ${verifyCommand}`,
    `\nThis is attempt ${attempt} of ${maxAttempts}. Decide the single next action and reply with ONE raw JSON object, no prose, no code fences. Use exactly one of these shapes:`,
    `{"kind":"install","command":"<dependency install command>","reason":"<why>"}`,
    `{"kind":"patch","file":"<path>","edits":[{"find":"<exact snippet to replace>","replace":"<new snippet>"}],"reason":"<why>"}`,
    `{"kind":"verify","reason":"<why just re-run>"}`,
    `{"kind":"done","reason":"<why no fix is needed / cannot proceed>"}`,
    "",
    "For patches: each 'find' must be copied EXACTLY from the code above and must be unique in the file. Keep edits minimal.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** Tolerantly parse the model's reply into a validated FixAction. Throws on garbage. */
export function parseFixAction(raw: string): FixAction {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("model did not return a JSON action");
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new Error("model returned invalid JSON");
  }
  const kind = obj.kind;
  if (kind === "install") {
    if (typeof obj.command !== "string" || !obj.command.trim()) throw new Error("install action missing 'command'");
    return { kind, command: obj.command.trim(), reason: str(obj.reason) };
  }
  if (kind === "patch") {
    if (typeof obj.file !== "string" || !obj.file.trim()) throw new Error("patch action missing 'file'");
    if (!Array.isArray(obj.edits) || obj.edits.length === 0) throw new Error("patch action missing 'edits'");
    const edits: Edit[] = obj.edits.map((e, i) => {
      const o = e as Record<string, unknown>;
      if (typeof o.find !== "string" || typeof o.replace !== "string") throw new Error(`patch edit ${i + 1} needs string find/replace`);
      return { find: o.find, replace: o.replace };
    });
    return { kind, file: obj.file.trim(), edits, reason: str(obj.reason) };
  }
  if (kind === "verify") return { kind, reason: str(obj.reason) };
  if (kind === "done") return { kind, reason: str(obj.reason) };
  throw new Error(`unknown action kind: ${String(kind)}`);
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
