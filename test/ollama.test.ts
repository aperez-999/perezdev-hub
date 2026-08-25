import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { execSync } from "node:child_process";
import { AddressInfo } from "node:net";
import { detectOllama, ollamaGenerateExtras, promptModel } from "../src/core/ollama.js";
import { Engine } from "../src/engine/bridge.js";

const hasPython = (() => {
  try {
    execSync("python3 --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("ollamaGenerateExtras", () => {
  it("caps chat replies and keeps write jobs longer", () => {
    expect(ollamaGenerateExtras("low", "chat").options.num_predict).toBe(256);
    expect(ollamaGenerateExtras("medium", "chat").options.num_predict).toBe(512);
    expect(ollamaGenerateExtras("high", "chat").options.num_predict).toBe(1536);
    expect(ollamaGenerateExtras("low", "write").options.num_predict).toBe(2048);
    expect(ollamaGenerateExtras("medium", "chat").keep_alive).toBe("30m");
  });
});

describe("promptModel", () => {
  it("forwards keep_alive and the token budget", async () => {
    const sent: Record<string, unknown>[] = [];
    await promptModel(
      {
        send: async (_op, params) => {
          sent.push(params);
          return { response: "ok" };
        },
      },
      "llama3",
      "hi",
      { thinking: "low" },
    );
    expect(sent[0]).toMatchObject({
      model: "llama3",
      prompt: "hi",
      keep_alive: "30m",
      options: { num_predict: 256, temperature: 0.2 },
    });
  });
});

describe.runIf(hasPython)("ollama routing", () => {
  it("returns a well-formed status and never throws", async () => {
    const status = await detectOllama();
    expect(typeof status.available).toBe("boolean");
    expect(Array.isArray(status.models)).toBe(true);
    if (status.available) {
      expect(status.error).toBeUndefined();
    } else {
      expect(status.models).toEqual([]);
      expect(typeof status.error).toBe("string");
    }
  });
});

describe.runIf(hasPython)("python engine ollama_generate", () => {
  let server: Server | undefined;
  const prevHost = process.env.OLLAMA_HOST;

  afterEach(async () => {
    if (prevHost === undefined) delete process.env.OLLAMA_HOST;
    else process.env.OLLAMA_HOST = prevHost;
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  });

  it("posts keep_alive and options to Ollama", async () => {
    const bodies: unknown[] = [];
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        bodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ response: "ok", done: false }) + "\n");
        res.write(JSON.stringify({ done: true }) + "\n");
        res.end();
      });
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    process.env.OLLAMA_HOST = `http://127.0.0.1:${port}`;
    const engine = new Engine();
    try {
      const text = await promptModel(engine, "llama3", "hi", { thinking: "low" });
      expect(text).toBe("ok");
      expect(bodies[0]).toMatchObject({
        model: "llama3",
        prompt: "hi",
        keep_alive: "30m",
        stream: true,
        options: { num_predict: 256 },
      });
    } finally {
      engine.close();
    }
  });
});
