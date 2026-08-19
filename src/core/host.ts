/** Detect the host app when config files are missing (e.g. Cursor with no rules yet). */

export function isCursorHost(): boolean {
  if (process.env.CURSOR_TRACE_ID) return true;
  if (process.env.CURSOR_AGENT) return true;
  const term = process.env.TERM_PROGRAM ?? "";
  return /cursor/i.test(term);
}
