// From guides/queries.md "Exposing an endpoint", reactivity.md "Seal a broader query"
// and mutations.md "Returning the txid from your backend"

// Not from the guides: load .env.local and check it before the modules below read process.env
import "./load-env";
import "./env";

import { serve } from "@hono/node-server";
import { and, eq, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";

import { requireUser } from "./auth";
import { db, pool } from "./db";
import { inboxQuery, messagesQuery } from "./queries";
import { realtime } from "./realtime";
import { channelMembers, messages } from "./schema";

export type MutationResponse =
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

const messageId = validator("param", (value, c) => {
  const id: unknown = value.id;

  if (!isUuid(id)) {
    return c.json({ error: "id must be a uuid" }, 400);
  }

  return { id };
});

// Not from the guides: there's no channels table, and the guides use channel 2
const CHANNELS = [
  { id: 1, name: "general" },
  { id: 2, name: "support" },
  { id: 3, name: "random" },
];

const app = new Hono()
  .post(
    "/api/v1/messages/live",
    validator("json", (value, c) => {
      const channelId: unknown = value?.channelId;

      if (typeof channelId !== "number" || !Number.isInteger(channelId)) {
        return c.json({ error: "channelId must be an integer" }, 400);
      }

      return { channelId };
    }),
    async (c) => {
      const user = await requireUser(c);
      const { channelId } = c.req.valid("json");

      const query = messagesQuery(user.id, channelId);
      const sealedQuery = await realtime.seal({ query });

      return c.json(sealedQuery);
    },
  )
  .post("/api/v1/inbox/live", async (c) => {
    const user = await requireUser(c);

    const sealedQuery = await realtime.seal({ query: inboxQuery(user.id) });

    return c.json(sealedQuery);
  })
  // Not from the guides: the live queries join through channel_members, so add the signed-in user to every channel
  .post("/api/v1/channels/join", async (c) => {
    const user = await requireUser(c);

    await db
      .insert(channelMembers)
      .values(
        CHANNELS.map((channel) => ({
          channel_id: channel.id,
          user_id: user.id,
        })),
      )
      .onConflictDoNothing();

    return c.json({ channels: CHANNELS });
  })
  .post(
    "/api/v1/messages",
    validator("json", (value, c) => {
      const id: unknown = value?.id;
      const channelId: unknown = value?.channelId;
      const body: unknown = value?.body;

      if (!isUuid(id)) {
        return c.json({ error: "id must be a uuid" }, 400);
      }

      if (typeof channelId !== "number" || !Number.isInteger(channelId)) {
        return c.json({ error: "channelId must be an integer" }, 400);
      }

      if (typeof body !== "string" || body.trim() === "") {
        return c.json({ error: "body must be a non-empty string" }, 400);
      }

      return { id, channelId, body };
    }),
    async (c) => {
      const user = await requireUser(c);
      const { id, channelId, body } = c.req.valid("json");

      const result = await db.transaction(
        async (tx): Promise<MutationResponse> => {
          const [membership] = await tx
            .select({ user_id: channelMembers.user_id })
            .from(channelMembers)
            .where(
              and(
                eq(channelMembers.channel_id, channelId),
                eq(channelMembers.user_id, user.id),
              ),
            );

          if (!membership) {
            throw new HTTPException(403, {
              message: "Not a member of this channel",
            });
          }

          await tx
            .insert(messages)
            .values({ id, channel_id: channelId, author_id: user.id, body });

          return { kind: "committed", txid: await currentTxId(tx) };
        },
      );

      return c.json(result);
    },
  )
  .patch(
    "/api/v1/messages/:id",
    messageId,
    validator("json", (value, c) => {
      const body: unknown = value?.body;

      if (typeof body !== "string" || body.trim() === "") {
        return c.json({ error: "body must be a non-empty string" }, 400);
      }

      return { body };
    }),
    async (c) => {
      const user = await requireUser(c);
      const { id } = c.req.valid("param");
      const { body } = c.req.valid("json");

      const result = await db.transaction(
        async (tx): Promise<MutationResponse> => {
          const updated = await tx
            .update(messages)
            .set({ body })
            .where(
              and(
                eq(messages.id, id),
                eq(messages.author_id, user.id),
                ne(messages.body, body),
              ),
            )
            .returning({ id: messages.id });

          if (updated.length === 0) {
            return { kind: "unchanged" };
          }

          return { kind: "committed", txid: await currentTxId(tx) };
        },
      );

      return c.json(result);
    },
  )
  .delete("/api/v1/messages/:id", messageId, async (c) => {
    const user = await requireUser(c);
    const { id } = c.req.valid("param");

    const result = await db.transaction(
      async (tx): Promise<MutationResponse> => {
        const deleted = await tx
          .delete(messages)
          .where(and(eq(messages.id, id), eq(messages.author_id, user.id)))
          .returning({ id: messages.id });

        if (deleted.length === 0) {
          return { kind: "unchanged" };
        }

        return { kind: "committed", txid: await currentTxId(tx) };
      },
    );

    return c.json(result);
  });

export type AppType = typeof app;

export default app;

// Not from the guides: checks the database, then serves the API behind Vite's /api proxy
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
