// From guides/queries.md "Parameter types". Not imported by the app
import { pgParam, rawSql } from "@neon/realtime/server";

import type { Message } from "./schema";

export function messagesSinceQuery(
  userId: string,
  channelId: number,
  since: Date,
) {
  return rawSql<Message>(
    `SELECT messages.author_id, messages.body, messages.channel_id,
       messages.created_at, messages.id FROM messages
     INNER JOIN channel_members ON channel_members.channel_id = messages.channel_id
     WHERE channel_members.user_id = $1 AND messages.channel_id = $2 AND messages.created_at > $3
     ORDER BY messages.created_at DESC
     LIMIT 50`,
    [userId, channelId, pgParam.timestamptz(since)],
  );
}
