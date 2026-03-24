/** Cloud fallbacks used when no local Ollama model is available. */

export interface CloudOpts {
  system?: string;
  onToken?: (t: string) => void;
}

/** Stream a completion from Anthropic (optional SDK, loaded dynamically). */
export async function promptAnthropic(model: string, prompt: string, opts: CloudOpts = {}): Promise<string> {
  let mod: { default: new () => AnthropicLike };
  try {
    // @ts-expect-error optional dependency
    mod = await import("@anthropic-ai/sdk");
  } catch {
    throw new Error("cloud needs @anthropic-ai/sdk — run: npm i @anthropic-ai/sdk");
  }
  const client = new mod.default();
  const stream = client.messages.stream({
    model,
    max_tokens: 2048,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: "user", content: prompt }],
  });
  if (opts.onToken) stream.on("text", opts.onToken);
  const final = await stream.finalMessage();
  return (final.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

/** Stream a completion from OpenAI's chat API over SSE (raw fetch, no SDK). */
export async function promptOpenAI(model: string, prompt: string, opts: CloudOpts = {}): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const messages = opts.system
    ? [{ role: "system", content: opts.system }, { role: "user", content: prompt }]
    : [{ role: "user", content: prompt }];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: true, messages }),
  });
  if (!res.ok || !res.body) throw new Error(`OpenAI request failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const tok = JSON.parse(data)?.choices?.[0]?.delta?.content;
        if (typeof tok === "string") {
          full += tok;
          opts.onToken?.(tok);
        }
      } catch {
        /* ignore keep-alive lines */
      }
    }
  }
  return full;
}

interface AnthropicLike {
  messages: {
    stream(params: Record<string, unknown>): {
      on(event: "text", cb: (t: string) => void): void;
      finalMessage(): Promise<{ content?: { type: string; text?: string }[] }>;
    };
  };
}
