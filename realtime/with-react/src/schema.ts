import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const todos = pgTable("realtime_todos", {
  // The client picks the id, so an optimistic todo and its synced row share it
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  // Random ids don't sort by age, so the live query orders by this instead
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
