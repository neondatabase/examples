// From guides/queries.md "Setup"
import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey(),
  channel_id: integer("channel_id").notNull(),
  author_id: text("author_id").notNull(),
  body: text("body").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const channelMembers = pgTable(
  "channel_members",
  {
    channel_id: integer("channel_id").notNull(),
    user_id: text("user_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.channel_id, table.user_id] })],
);

export type Message = typeof messages.$inferSelect;
