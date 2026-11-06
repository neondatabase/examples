// From guides/queries.md "Exposing an endpoint", reactivity.md "Seal a broader query"
// and mutations.md "Returning the txid from your backend"

// Not from the guides: load .env.local and check it before the modules below read process.env
import "./load-env";
import "./env";

import { serve } from "@hono/node-server";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
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

// The id of the transaction that made the change, read in the write's own RETURNING
const txid = sql<string>`pg_current_xact_id()::text`;

const mutationResponse = (row?: { txid: string }): MutationResponse =>
  row ? { kind: "committed", txid: row.txid } : { kind: "unchanged" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function isBody(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

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
      const batch: unknown = value?.batch;

      if (
        !Array.isArray(batch) ||
        batch.length === 0 ||
        !batch.every(
          (item): item is { id: string; channelId: number; body: string } =>
            isUuid(item?.id) &&
            Number.isInteger(item?.channelId) &&
            isBody(item?.body),
        )
      ) {
        return c.json(
          {
            error: "batch must be a non-empty array of { id, channelId, body }",
          },
          400,
        );
      }

      return { batch };
    }),
    async (c) => {
      const user = await requireUser(c);
      const { batch } = c.req.valid("json");
      const channelIds = [
        ...new Set(batch.map((message) => message.channelId)),
      ];
      const rows = batch.map(({ id, channelId, body }) => ({
        id,
        channel_id: channelId,
        body,
      }));

      // One statement: the batch is written only if the user is a member of every channel in it
      const [sent] = await db
        .insert(messages)
        .select(
          db
            .select({
              id: sql`batch.id`.as("id"),
              channel_id: sql`batch.channel_id`.as("channel_id"),
              author_id: sql`${user.id}`.as("author_id"),
              body: sql`batch.body`.as("body"),
              created_at: sql`now()`.as("created_at"),
            })
            .from(
              sql`jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as batch(id uuid, channel_id integer, body text)`,
            )
            .where(
              eq(
                db.$count(
                  channelMembers,
                  and(
                    eq(channelMembers.user_id, user.id),
                    inArray(channelMembers.channel_id, channelIds),
                  ),
                ),
                channelIds.length,
              ),
            ),
        )
        .returning({ txid });

      if (!sent) {
        throw new HTTPException(403, {
          message: "Not a member of this channel",
        });
      }

      return c.json(mutationResponse(sent));
    },
  )
  .patch(
    "/api/v1/messages",
    validator("json", (value, c) => {
      const batch: unknown = value?.batch;

      if (
        !Array.isArray(batch) ||
        batch.length === 0 ||
        !batch.every(
          (item): item is { id: string; body: string } =>
            isUuid(item?.id) && isBody(item?.body),
        )
      ) {
        return c.json(
          { error: "batch must be a non-empty array of { id, body }" },
          400,
        );
      }

      return { batch };
    }),
    async (c) => {
      const user = await requireUser(c);
      const { batch } = c.req.valid("json");

      const [edited] = await db
        .update(messages)
        .set({ body: sql`edit.body` })
        .from(
          sql`jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) as edit(id uuid, body text)`,
        )
        .where(
          and(
            eq(messages.id, sql`edit.id`),
            eq(messages.author_id, user.id),
            ne(messages.body, sql`edit.body`),
          ),
        )
        .returning({ txid });

      return c.json(mutationResponse(edited));
    },
  )
  .delete(
    "/api/v1/messages",
    validator("json", (value, c) => {
      const batch: unknown = value?.batch;

      if (!Array.isArray(batch) || batch.length === 0 || !batch.every(isUuid)) {
        return c.json(
          { error: "batch must be a non-empty array of uuids" },
          400,
        );
      }

      return { batch };
    }),
    async (c) => {
      const user = await requireUser(c);
      const { batch } = c.req.valid("json");

      const [deleted] = await db
        .delete(messages)
        .where(
          and(inArray(messages.id, batch), eq(messages.author_id, user.id)),
        )
        .returning({ txid });

      return c.json(mutationResponse(deleted));
    },
  );

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
