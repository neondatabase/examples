import "./load-env.js";

import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { createRealtime } from "@neon/realtime/server";
import { drizzleAdapter } from "@neon/realtime-drizzle";
import { desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { db, pool } from "./db.js";
import { env, postgresDatabaseName } from "./env.js";
import { todos } from "./schema.js";

const realtime = createRealtime({
  secret: env.realtime.secret,
  db: postgresDatabaseName,
  adapter: drizzleAdapter(),
});

type MutationResponse =
  | { readonly kind: "committed"; readonly txid: string }
  | { readonly kind: "unchanged" };

const txid = sql<string>`pg_current_xact_id()::text`;

const mutationResponse = (row?: { txid: string }): MutationResponse =>
  row ? { kind: "committed", txid: row.txid } : { kind: "unchanged" };

const selectTodos = () =>
  db
    .select({ id: todos.id, title: todos.title, completed: todos.completed })
    .from(todos)
    .orderBy(desc(todos.created_at));

const createTodoInput = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
});

const toggleTodoInput = z.object({ completed: z.boolean() });
const todoParams = z.object({ id: z.uuid() });

const app = new Hono()
  // This demo has no auth, so it seals every todo for anyone who asks. Check
  // the session before sealing, and scope the query to what the user may see.
  .post("/api/todos/live", async (c) => {
    const query = await realtime.seal({ query: selectTodos() });
    return c.json({ query, websocketUrl: env.realtime.url });
  })
  // These write routes are unauthenticated for the demo. Authorize each write
  // before adapting this example for production.
  .post("/api/todos", zValidator("json", createTodoInput), async (c) => {
    const { id, title } = c.req.valid("json");
    const [created] = await db
      .insert(todos)
      .values({ id, title })
      .returning({ txid });
    return c.json(mutationResponse(created), 201);
  })
  .patch(
    "/api/todos/:id",
    zValidator("param", todoParams),
    zValidator("json", toggleTodoInput),
    async (c) => {
      const { id } = c.req.valid("param");
      const { completed } = c.req.valid("json");
      const [updated] = await db
        .update(todos)
        .set({ completed })
        .where(eq(todos.id, id))
        .returning({ txid });
      return c.json(mutationResponse(updated));
    },
  )
  .delete("/api/todos/:id", zValidator("param", todoParams), async (c) => {
    const { id } = c.req.valid("param");
    const [deleted] = await db
      .delete(todos)
      .where(eq(todos.id, id))
      .returning({ txid });
    return c.json(mutationResponse(deleted));
  });

export type AppType = typeof app;

await pool.query("select 1");

const server = serve({
  fetch: app.fetch,
  hostname: "0.0.0.0",
  port: 3001,
});

console.log("Hono API listening on http://localhost:3001");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => void pool.end().finally(() => process.exit()));
  });
}
