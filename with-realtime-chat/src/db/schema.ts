import { pgTable, serial, text, timestamp, index } from 'drizzle-orm/pg-core';

export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    userName: text('user_name').notNull(),
    body: text('body').notNull().default(''),
    imageUrl: text('image_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('messages_created_at_idx').on(table.createdAt)],
);
