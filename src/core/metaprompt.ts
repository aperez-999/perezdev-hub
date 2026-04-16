// Metaprompts that turn a free-text goal into a skill body or an MCP config,
// plus a tolerant parser for the model's JSON. No network here — callers feed
// these strings to the active provider and pass the response back in.

/** Blueprint that asks the model for a full skill / system-instruction body. */
export function skillMetaprompt(goal: string): string {
  return [
    "You are an expert developer workflow architect. Generate an elite development skill and",
    `system instruction manual based on the following target user requirement: "${goal}".`,
    "",
    "Structure your output strictly using clean Markdown sections with the following format:",
    "# Role Definition & Scope",
    "# Key Technical Responsibilities",
    "# Required Project Coding Guidelines & Guardrails",
    "# Target Definitions of Done",
    "",
    "Output ONLY the raw markdown text body. Do not include chat commentary or conversational wrappers.",
  ].join("\n");
}

/** Blueprint that asks the model for a single MCP server JSON config. */
export function mcpMetaprompt(request: string, existingConfig?: string): string {
  return [
    `Analyze the following user integration request: "${request}".`,
    existingConfig ? `The current mcp.json is:\n${existingConfig}` : "",
    "Generate a valid, single JSON object configuration that matches the standard Model Context",
    "Protocol schema for an 'mcpServers' object key.",
    "",
    "Output ONLY the raw JSON string containing keys for 'command', 'args', and optional 'env'.",
    "Do not include markdown code block wraps.",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface ParsedMcp {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** Pull a `{command,args,env}` config out of the model's (possibly messy) reply. */
export function parseMcpConfig(raw: string): ParsedMcp {
  let text = raw.trim();
  // Strip ```json fences if the model added them despite instructions.
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  // Grab the first balanced-looking object if there's surrounding prose.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("model did not return a JSON object");
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("model returned invalid JSON");
  }
  // Unwrap an { mcpServers: { name: {...} } } or { name: {...} } wrapper.
  const node = unwrap(obj);
  const command = typeof node.command === "string" ? node.command : "";
  if (!command) throw new Error("config is missing a 'command'");
  const args = Array.isArray(node.args) ? node.args.map(String) : [];
  const env =
    node.env && typeof node.env === "object" && !Array.isArray(node.env)
      ? Object.fromEntries(Object.entries(node.env as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
      : {};
  return { command, args, env };
}

type McpNode = { command?: unknown; args?: unknown; env?: unknown };

function unwrap(obj: unknown): McpNode {
  if (!obj || typeof obj !== "object") return {};
  const o = obj as Record<string, unknown>;
  if ("command" in o) return o as McpNode;
  const inner = "mcpServers" in o ? o.mcpServers : o;
  if (inner && typeof inner === "object") {
    const first = Object.values(inner as Record<string, unknown>)[0];
    if (first && typeof first === "object" && "command" in (first as Record<string, unknown>)) {
      return first as McpNode;
    }
  }
  return {};
}
