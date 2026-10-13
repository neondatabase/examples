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

// What a write route returns. `kind` is a literal, so the client can narrow on it.
type MutationResponse =
  | { readonly kind: "committed"; readonly txid: string }
  | { readonly kind: "unchanged" };

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Must run inside the write transaction, so it returns that transaction's id
async function currentTxId(tx: Transaction): Promise<string> {
  const result = await tx.execute<{ txid: string }>(
    sql`select pg_current_xact_id()::text as txid`,
  );
  return result.rows[0]!.txid;
}

const selectTodos = () =>
  db
    .select({ id: todos.id, title: todos.title, completed: todos.completed })
    .from(todos)
    .orderBy(desc(todos.created_at));

const createTodoInput = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
});

const toggleTodoInput = z.object({
  completed: z.boolean(),
});

const todoParams = z.object({
  id: z.uuid(),
});

const app = new Hono()
  // This demo has no auth, so it seals every todo for anyone who asks. Check
  // the session before sealing, and scope the query to what the user may see:
  // https://neon.com/docs/realtime/guides/queries#authorization
  // The sealed query is a bearer token, so it isn't served from a cacheable GET.
  .post("/api/todos/live", async (c) => {
    const query = await realtime.seal({ query: selectTodos() });
    return c.json({
      query,
      websocketUrl: env.realtime.url,
    });
  })
  // The write routes have no auth either, so anyone can change any todo. Check
  // the session in each one, and only write rows the user may change:
  // https://neon.com/docs/realtime/guides/queries#authorization
  .post("/api/todos", zValidator("json", createTodoInput), async (c) => {
    const { id, title } = c.req.valid("json");
    const result = await db.transaction(
      async (tx): Promise<MutationResponse> => {
        await tx.insert(todos).values({ id, title });
        return { kind: "committed", txid: await currentTxId(tx) };
      },
    );
    return c.json(result, 201);
  })
  .patch(
    "/api/todos/:id",
    zValidator("param", todoParams),
    zValidator("json", toggleTodoInput),
    async (c) => {
      const { id } = c.req.valid("param");
      const { completed } = c.req.valid("json");
      const result = await db.transaction(
        async (tx): Promise<MutationResponse> => {
          const updated = await tx
            .update(todos)
            .set({ completed })
            .where(eq(todos.id, id))
            .returning({ id: todos.id });
          // No row matched, for example because another tab deleted the todo.
          // Nothing changed, so there's no txid for the client to wait for.
          if (updated.length === 0) return { kind: "unchanged" };
          return { kind: "committed", txid: await currentTxId(tx) };
        },
      );
      return c.json(result);
    },
  )
  .delete("/api/todos/:id", zValidator("param", todoParams), async (c) => {
    const { id } = c.req.valid("param");
    const result = await db.transaction(
      async (tx): Promise<MutationResponse> => {
        const deleted = await tx
          .delete(todos)
          .where(eq(todos.id, id))
          .returning({ id: todos.id });
        if (deleted.length === 0) return { kind: "unchanged" };
        return { kind: "committed", txid: await currentTxId(tx) };
      },
    );
    return c.json(result);
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
