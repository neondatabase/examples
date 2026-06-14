import { pgTable, integer } from 'drizzle-orm/pg-core';

// A single shared counter lives in one row (id = 1). Keeping the value in
// Postgres — not in module memory — is what lets every isolate (and every
// reconnecting client) agree on the same number.
export const counters = pgTable('counters', {
  id: integer('id').primaryKey(),
  value: integer('value').notNull().default(0),
});
