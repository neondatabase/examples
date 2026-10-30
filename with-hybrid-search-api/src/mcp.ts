import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Handler } from "hono";
import { searchSchema, type SearchInput } from "./input.ts";

export function createSearchMcpHandler(
  search: (input: SearchInput) => Promise<Record<string, unknown>>,
): Handler {
  return async (c) => {
    if (c.req.method !== "POST") {
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    }
    const origin = c.req.header("Origin");
    if (origin && origin !== new URL(c.req.url).origin) {
      return c.json({ error: "invalid origin" }, 403);
    }

    // Each request gets a fresh stateless transport, so no session affinity is needed.
    const server = new McpServer({
      name: "neon-document-search",
      version: "1.0.0",
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    server.registerTool(
      "search_documents",
      {
        title: "Search documents",
        description:
          "Search indexed Markdown documents and return ranked chunks with parent document IDs, heading context and metadata. Use hybrid, vector or keyword mode; limit counts chunks.",
        inputSchema: searchSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (input) => {
        try {
          const result = await search(input);
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch (error) {
          console.error("MCP search failed", error);
          return {
            isError: true,
            content: [{ type: "text", text: "Search service unavailable" }],
          };
        }
      },
    );
    try {
      await server.connect(transport);
      return await transport.handleRequest(c.req.raw);
    } finally {
      await server.close();
    }
  };
}
