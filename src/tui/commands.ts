/**
 * Single source of truth for slash commands. Both the `/help` output and the
 * SlashMenu autocomplete read from this list, so they can never drift from each
 * other. Dispatch still lives in console.tsx; this is the metadata surface.
 */
export interface Command {
  /** Canonical name including the leading slash, e.g. "/build". */
  name: string;
  /** Usage hint shown in the slash menu + help, e.g. "/build <description>". */
  usage: string;
  /** One-line description. */
  help: string;
}

export const COMMANDS: Command[] = [
  { name: "/build", usage: "/build <description>", help: "Generate a custom agent + skill files" },
  { name: "/create", usage: "/create <name>: <purpose>", help: "Generate an agent with an explicit name" },
  { name: "/mcp", usage: "/mcp auto | <id>", help: "Discover or inject MCP servers for this repo" },
  { name: "/pull", usage: "/pull <model>", help: "Download an Ollama model (live progress)" },
  { name: "/recommend", usage: "/recommend", help: "Project-tailored agent + MCP suggestions" },
  { name: "/install", usage: "/install <name>", help: "Install a suggested agent or MCP server" },
  { name: "/tree", usage: "/tree [dir]", help: "File-tree map of a directory" },
  { name: "/diagnose", usage: "/diagnose <file>", help: "Diagnose a traceback / log file" },
  { name: "/autofix", usage: "/autofix <file> [| cmd]", help: "Diagnose, patch + verify in a gated loop" },
  { name: "/models", usage: "/models", help: "List pulled local models" },
  { name: "/list", usage: "/list", help: "List installed agents & MCP servers" },
  { name: "/yes", usage: "/yes", help: "Apply the pending confirmation" },
  { name: "/clear", usage: "/clear", help: "Clear the activity log" },
  { name: "/help", usage: "/help", help: "Show this command list" },
  { name: "/quit", usage: "/quit", help: "Exit PerezDev Hub" },
];

/** Filter the registry for a slash query (leading "/", case-insensitive). */
export function filterCommands(query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (q === "/" || q === "") return COMMANDS;
  return COMMANDS.filter((c) => c.name.startsWith(q));
}

/** The `/help` body, generated from the registry so it can't go stale. */
export function helpLines(): string[] {
  return ["commands:", ...COMMANDS.map((c) => `  ${c.usage.padEnd(26)} ${c.help}`)];
}
