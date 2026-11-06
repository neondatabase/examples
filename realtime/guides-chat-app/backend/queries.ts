// From guides/queries.md "Using a query builder or ORM" and reactivity.md "Seal a broader query"
import { and, desc, eq, getTableColumns } from "drizzle-orm";

import { db } from "./db";
import { channelMembers, messages } from "./schema";

export function messagesQuery(userId: string, channelId: number) {
  return db
    .select(getTableColumns(messages))
    .from(messages)
    .innerJoin(
      channelMembers,
      eq(channelMembers.channel_id, messages.channel_id),
    )
    .where(
      and(
        eq(channelMembers.user_id, userId),
        eq(messages.channel_id, channelId),
      ),
    )
    .orderBy(desc(messages.created_at))
    .limit(50);
}

export function inboxQuery(userId: string) {
  return db
    .select(getTableColumns(messages))
    .from(messages)
    .innerJoin(
      channelMembers,
      eq(channelMembers.channel_id, messages.channel_id),
    )
    .where(eq(channelMembers.user_id, userId))
    .orderBy(desc(messages.created_at))
    .limit(500);
}
