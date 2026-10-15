// From guides/queries.md "Using raw SQL" and "Query parameters". An alternative to queries.ts, not imported by the app
import { rawSql } from "@neon/realtime/server";

import type { Message } from "./schema";

export const allMessages = rawSql<Message>(
  `SELECT author_id, body, channel_id, created_at, id FROM messages`,
);

export function messagesQuery(userId: string, channelId: number) {
  return rawSql<Message>(
    `SELECT messages.author_id, messages.body, messages.channel_id,
       messages.created_at, messages.id FROM messages
     INNER JOIN channel_members ON channel_members.channel_id = messages.channel_id
     WHERE channel_members.user_id = $1 AND messages.channel_id = $2
     ORDER BY messages.created_at DESC
     LIMIT 50`,
    [userId, channelId],
  );
}
