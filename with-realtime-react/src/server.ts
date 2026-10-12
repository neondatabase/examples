import "./load-env.js";

import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { createRealtime } from "@neon/realtime/server";
import { drizzleAdapter } from "@neon/realtime-drizzle";
import { asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { db, pool } from "./db.js";
import { requiredEnv } from "./env.js";
import { todos } from "./schema.js";

const realtime = createRealtime({
  secret: requiredEnv("NEON_REALTIME_SECRET"),
  db: requiredEnv("NEON_DATABASE_NAME"),
  adapter: drizzleAdapter(),
});

const selectTodos = () =>
  db
    .select({ id: todos.id, title: todos.title, completed: todos.completed })
    .from(todos)
    .orderBy(asc(todos.id));

const createTodoInput = z.object({
  title: z.string().trim().min(1).max(200),
});

const todoParams = z.object({
  id: z.coerce.number().int().positive(),
});

const app = new Hono()
  .get("/api/todos/live", async (c) => {
    const query = await realtime.seal({ query: selectTodos() });
    return c.json({
      query,
      websocketUrl: requiredEnv("NEON_REALTIME_URL"),
    });
  })
  .post("/api/todos", zValidator("json", createTodoInput), async (c) => {
    const { title } = c.req.valid("json");
    const [todo] = await db
      .insert(todos)
      .values({ title })
      .returning({
        id: todos.id,
        txid: sql<string>`pg_current_xact_id()::text`,
      });
    if (!todo) throw new Error("Postgres did not return the new todo");
    return c.json(todo, 201);
  })
  .patch("/api/todos/:id", zValidator("param", todoParams), async (c) => {
    const { id } = c.req.valid("param");
    const [updated] = await db
      .update(todos)
      .set({ completed: sql`not ${todos.completed}` })
      .where(eq(todos.id, id))
      .returning({ txid: sql<string>`pg_current_xact_id()::text` });
    if (!updated) return c.json({ error: "Todo not found" }, 404);
    return c.json(updated);
  })
  .delete("/api/todos/:id", zValidator("param", todoParams), async (c) => {
    const { id } = c.req.valid("param");
    const [deleted] = await db
      .delete(todos)
      .where(eq(todos.id, id))
      .returning({ txid: sql<string>`pg_current_xact_id()::text` });
    if (!deleted) return c.json({ error: "Todo not found" }, 404);
    return c.json(deleted);
  });

export type AppType = typeof app;

await pool.query("select 1");

const server = serve({
  fetch: app.fetch,
  hostname: "127.0.0.1",
  port: 3001,
});

console.log("Hono API listening on http://127.0.0.1:3001");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => void pool.end().finally(() => process.exit()));
  });
}
