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
    const result = await db.transaction(async (transaction) => {
      const [todo] = await transaction
        .insert(todos)
        .values({ title })
        .returning({ id: todos.id });
      if (!todo) throw new Error("Postgres did not return the new todo");
      const result = await transaction.execute<{ txid: string }>(
        sql`select pg_current_xact_id()::text as txid`,
      );
      const txid = result.rows[0]?.txid;
      if (!txid) throw new Error("Postgres did not return a transaction ID");
      return { id: todo.id, txid };
    });
    return c.json(result, 201);
  })
  .patch("/api/todos/:id", zValidator("param", todoParams), async (c) => {
    const { id } = c.req.valid("param");
    const txid = await db.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(todos)
        .set({ completed: sql`not ${todos.completed}` })
        .where(eq(todos.id, id))
        .returning({ id: todos.id });
      if (!updated) return undefined;
      const result = await transaction.execute<{ txid: string }>(
        sql`select pg_current_xact_id()::text as txid`,
      );
      return result.rows[0]?.txid;
    });
    if (!txid) return c.json({ error: "Todo not found" }, 404);
    return c.json({ txid });
  })
  .delete("/api/todos/:id", zValidator("param", todoParams), async (c) => {
    const { id } = c.req.valid("param");
    const txid = await db.transaction(async (transaction) => {
      const [deleted] = await transaction
        .delete(todos)
        .where(eq(todos.id, id))
        .returning({ id: todos.id });
      if (!deleted) return undefined;
      const result = await transaction.execute<{ txid: string }>(
        sql`select pg_current_xact_id()::text as txid`,
      );
      return result.rows[0]?.txid;
    });
    if (!txid) return c.json({ error: "Todo not found" }, 404);
    return c.json({ txid });
  });

export type AppType = typeof app;

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
