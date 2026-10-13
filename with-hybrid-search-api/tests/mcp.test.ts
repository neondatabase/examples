import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createSearchMcpHandler } from "../src/mcp.ts";
import type { SearchInput } from "../src/input.ts";

function server(
  search: (input: SearchInput) => Promise<Record<string, unknown>>,
) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (c.req.header("Authorization") !== "Bearer test-key") {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });
  app.all("/mcp", createSearchMcpHandler(search));
  return app;
}

async function connect(app: Hono) {
  const client = new Client({ name: "search-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost/mcp"),
    {
      requestInit: { headers: { Authorization: "Bearer test-key" } },
      fetch: async (url, init) => app.request(new Request(url, init)),
    },
  );
  await client.connect(transport);
  return { client, transport };
}

test("MCP initializes, discovers the read-only search tool and returns shared search results", async () => {
  const inputs: SearchInput[] = [];
  const response = {
    mode: "hybrid",
    results: [{ id: "guide-1", content: "Neon branches" }],
  };
  const app = server(async (input) => {
    inputs.push(input);
    return response;
  });
  const { client, transport } = await connect(app);
  try {
    assert.equal(transport.sessionId, undefined);
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((tool) => tool.name),
      ["search_documents"],
    );
    assert.equal(tools[0]!.annotations?.readOnlyHint, true);
    assert.equal(tools[0]!.inputSchema.additionalProperties, false);
    assert.deepEqual(Object.keys(tools[0]!.inputSchema.properties!).sort(), [
      "candidates",
      "filter",
      "limit",
      "mode",
      "query",
      "rrfK",
    ]);
    const result = await client.callTool({
      name: "search_documents",
      arguments: { query: "  branches  " },
    });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, response);
    assert.deepEqual(result.content, [
      { type: "text", text: JSON.stringify(response) },
    ]);
    assert.deepEqual(inputs, [
      {
        query: "branches",
        mode: "hybrid",
        filter: {},
        limit: 10,
        candidates: 40,
        rrfK: 60,
      },
    ]);
  } finally {
    await client.close();
  }
});

test("MCP shares search validation and forwards modes, filters and tuning options", async () => {
  const inputs: SearchInput[] = [];
  const { client } = await connect(
    server(async (input) => {
      inputs.push(input);
      return { mode: input.mode, results: [] };
    }),
  );
  try {
    for (const args of [
      { query: "" },
      { query: "branches", limit: "5" },
      { query: "branches", limit: 10, candidates: 5 },
      { query: "branches", extra: true },
    ]) {
      const result = await client.callTool({
        name: "search_documents",
        arguments: args,
      });
      assert.equal(result.isError, true);
    }
    assert.equal(inputs.length, 0);
    for (const mode of ["keyword", "vector", "hybrid"] as const) {
      const args = {
        query: "branches",
        mode,
        filter: { source: "docs" },
        limit: 5,
        candidates: 20,
        rrfK: 30,
      };
      await client.callTool({ name: "search_documents", arguments: args });
      assert.deepEqual(inputs.at(-1), args);
    }
  } finally {
    await client.close();
  }
});

test("concurrent MCP clients keep their results separate", async () => {
  const app = server(async (input) => ({
    mode: input.mode,
    results: [{ query: input.query }],
  }));
  const [a, b] = await Promise.all([connect(app), connect(app)]);
  try {
    const results = await Promise.all([
      a.client.callTool({
        name: "search_documents",
        arguments: { query: "first" },
      }),
      b.client.callTool({
        name: "search_documents",
        arguments: { query: "second" },
      }),
    ]);
    assert.deepEqual(
      results.map((result) => result.structuredContent),
      [
        { mode: "hybrid", results: [{ query: "first" }] },
        { mode: "hybrid", results: [{ query: "second" }] },
      ],
    );
  } finally {
    await Promise.all([a.client.close(), b.client.close()]);
  }
});

test("retrieval failures return an MCP tool error without database details", async (t) => {
  t.mock.method(console, "error", () => {});
  const { client } = await connect(
    server(async () => {
      throw new Error("secret database error");
    }),
  );
  try {
    const result = await client.callTool({
      name: "search_documents",
      arguments: { query: "branches" },
    });
    assert.equal(result.isError, true);
    assert.deepEqual(result.content, [
      { type: "text", text: "Search service unavailable" },
    ]);
    assert.equal(result.structuredContent, undefined);
  } finally {
    await client.close();
  }
});

test("MCP requires authorization, rejects cross-origin requests and unsupported methods", async () => {
  const app = server(async () => ({ results: [] }));
  assert.equal((await app.request("/mcp", { method: "POST" })).status, 401);
  const headers = { Authorization: "Bearer test-key" };
  for (const method of ["GET", "DELETE", "PUT"]) {
    const result = await app.request("/mcp", { method, headers });
    assert.equal(result.status, 405);
    assert.equal(result.headers.get("Allow"), "POST");
  }
  assert.equal(
    (
      await app.request("/mcp", {
        method: "POST",
        headers: { ...headers, Origin: "https://other.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await app.request("/mcp", { method: "POST", headers })).status,
    406,
  );
  const protocolHeaders = {
    ...headers,
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    Origin: "http://localhost",
  };
  assert.equal(
    (
      await app.request("/mcp", {
        method: "POST",
        headers: protocolHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "origin-test", version: "1.0.0" },
          },
        }),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await app.request("/mcp", {
        method: "POST",
        headers: protocolHeaders,
        body: "{",
      })
    ).status,
    400,
  );
});
