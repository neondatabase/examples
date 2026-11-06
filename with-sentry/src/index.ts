import "./instrument"; // MUST be the first import, before the framework/agent
import { Sentry } from "./instrument";
import { Hono } from "hono";
import { streamText, generateText, tool, stepCountIs } from "ai";
import { neon } from "@neon/ai-sdk-provider";
import { z } from "zod";

const app = new Hono();

// The runtime's ingress isn't auto-instrumented — create the request root span and
// isolation scope here, and flush before the isolate can idle.
app.use("*", (c, next) =>
  Sentry.withIsolationScope(() =>
    Sentry.startSpan(
      {
        op: "http.server",
        name: `${c.req.method} ${c.req.path}`,
        forceTransaction: true,
        attributes: { "http.request.method": c.req.method, "url.path": c.req.path },
      },
      async (span) => {
        await next();
        span.setAttribute("http.response.status_code", c.res.status);
      },
    ).finally(() => Sentry.flush(2000)),
  ),
);

const MODEL = process.env.AGENT_MODEL ?? "meta-llama-3-3-70b-instruct";
const FALLBACK_MODEL = process.env.AGENT_FALLBACK_MODEL ?? "llama-4-maverick";

app.get("/", (c) =>
  c.json({
    name: "with-sentry",
    routes: {
      "POST /chat": "streaming tool-calling agent (gen_ai traces)",
      "POST /summarize": "agent with model fallback (recoverable failures -> Sentry logs)",
      "GET /debug-sentry": "throws -> unhandled route error -> Sentry issue",
    },
  }),
);

app.post("/chat", async (c) => {
  const { messages } = await c.req.json();

  Sentry.setConversationId(c.req.header("x-conversation-id") ?? crypto.randomUUID());

  const result = streamText({
    model: neon(MODEL),
    system: "You are a concise assistant. Use tools when they help.",
    messages,
    tools: {
      getServerTime: tool({
        description: "Get the current server time in ISO format.",
        inputSchema: z.object({}),
        execute: async () => ({ now: new Date().toISOString() }),
      }),
      rollDice: tool({
        description: "Roll N six-sided dice and return the results.",
        inputSchema: z.object({ count: z.number().int().min(1).max(10) }),
        execute: async ({ count }) => ({
          rolls: Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6)),
        }),
      }),
    },
    stopWhen: stepCountIs(5),
    experimental_telemetry: { isEnabled: true },
    // streamText never throws — report stream failures explicitly.
    onError: ({ error }) => {
      Sentry.captureException(error, { tags: { component: "agent", phase: "chat-stream" } });
    },
  });

  // gen_ai spans end with the stream — flush while the request is still alive.
  const stream = result.textStream
    .pipeThrough(
      new TransformStream<string, string>({
        async flush() {
          await new Promise((r) => setTimeout(r, 0));
          await Sentry.flush(2000);
        },
      }),
    )
    .pipeThrough(new TextEncoderStream());
  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
});

app.post("/summarize", async (c) => {
  const body = await c.req.json();
  const text: string = body.text;
  const models: string[] = body.models ?? [MODEL, FALLBACK_MODEL];
  let lastError: unknown;

  for (const model of models) {
    try {
      const { text: summary } = await generateText({
        model: neon(model),
        prompt: `Summarize in one sentence: ${text}`,
        experimental_telemetry: { isEnabled: true },
      });
      Sentry.logger.info("summary produced", { component: "agent", model });
      return c.json({ summary, model });
    } catch (err) {
      lastError = err;
      // Recoverable — the next model gets a shot. A log, not an issue.
      Sentry.logger.warn("model attempt failed", {
        component: "agent",
        phase: "summarize-attempt",
        model,
        error: String(err),
      });
    }
  }

  // Terminal — every model failed. This one is an issue.
  Sentry.captureException(lastError, {
    tags: { component: "agent", phase: "summarize-all-failed" },
    contexts: { agent: { attempts: models.length } },
  });
  return c.json({ error: "all models failed" }, 502);
});

app.get("/debug-sentry", () => {
  throw new Error("sentry test: unhandled route error");
});

app.onError((err, c) => {
  Sentry.captureException(err);
  c.header("access-control-allow-origin", "*"); // cors() doesn't run on error responses
  return c.json({ error: "internal_error" }, 500);
});

export default app;
