import "./instrument"; // MUST be the first import, before the framework/agent
import { Sentry } from "./instrument";
import { Hono } from "hono";
import { streamText, generateText, tool, stepCountIs } from "ai";
import { neon } from "@neon/ai-sdk-provider";
import { z } from "zod";

const app = new Hono();

// The Neon runtime invokes the handler through its own ingress, not a node:http server
// the Sentry SDK can auto-instrument — so create the request root span (and per-request
// isolation scope) ourselves. Everything else (gen_ai spans, logs) nests under it.
app.use("*", (c, next) => {
  return Sentry.withIsolationScope(() =>
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
    ).finally(() =>
      // The isolate's background timers are unreliable after the response is sent, so
      // deliver buffered telemetry (streamed spans, logs) while the request is still alive.
      Sentry.flush(2000),
    ),
  );
});

const MODEL = process.env.AGENT_MODEL ?? "meta-llama-3-3-70b-instruct";
const FALLBACK_MODEL = process.env.AGENT_FALLBACK_MODEL ?? "llama-4-maverick";

app.get("/", (c) =>
  c.json({
    name: "neon-with-sentry",
    routes: {
      "POST /chat": "streaming tool-calling agent (gen_ai traces)",
      "POST /summarize": "agent with model fallback (recoverable failures -> Sentry logs)",
      "GET /debug-sentry": "throws -> unhandled route error -> Sentry issue",
    },
  }),
);

// The happy path: a streaming tool-calling agent. `experimental_telemetry` is what
// makes the AI SDK emit gen_ai spans for Sentry to pick up.
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
    // streamText never throws — failures surface as error parts inside the stream and the
    // HTTP response just ends. Without this hook a dead agent looks like an empty reply.
    onError: ({ error }) => {
      Sentry.captureException(error, { tags: { component: "agent", phase: "chat-stream" } });
    },
  });

  // The isolate can be suspended as soon as the response stream closes (waitUntil is a
  // stub in the preview), and the gen_ai spans only end once the model stream completes —
  // after the middleware's flush already ran. Hold the response open a beat longer and
  // flush from the stream's own finalizer, so telemetry ships while the request is alive.
  const stream = result.textStream
    .pipeThrough(
      new TransformStream<string, string>({
        async flush() {
          await new Promise((r) => setTimeout(r, 0)); // let the AI SDK end its spans first
          await Sentry.flush(2000);
        },
      }),
    )
    .pipeThrough(new TextEncoderStream());
  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
});

// The agent-that-falls-back path: recoverable failures become Sentry *logs*,
// only the terminal all-models-failed case becomes an *issue*.
app.post("/summarize", async (c) => {
  const body = await c.req.json();
  const text: string = body.text;
  // Model list can be overridden per request to demonstrate the fallback path.
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
      // Recoverable: this attempt failed, we'll try the next model. A log, not an issue.
      Sentry.logger.warn("model attempt failed", {
        component: "agent",
        phase: "summarize-attempt",
        model,
        error: String(err),
      });
    }
  }

  // Terminal: every model failed. This one is an issue.
  Sentry.captureException(lastError, {
    tags: { component: "agent", phase: "summarize-all-failed" },
    contexts: { agent: { attempts: models.length } },
  });
  return c.json({ error: "all models failed" }, 502);
});

// Verification route: an unhandled error that should surface as a Sentry issue via onError.
app.get("/debug-sentry", () => {
  throw new Error("sentry test: unhandled route error");
});

app.onError((err, c) => {
  Sentry.captureException(err);
  c.header("access-control-allow-origin", "*"); // cors() doesn't run on error responses
  return c.json({ error: "internal_error" }, 500);
});

export default app;
