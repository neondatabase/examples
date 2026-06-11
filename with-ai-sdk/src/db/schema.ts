import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const images = pgTable('images', {
  id: serial('id').primaryKey(),
  prompt: text('prompt').notNull(),
  bucketKey: text('bucket_key').notNull(),
  contentType: text('content_type').notNull(),
  bytes: integer('bytes').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
