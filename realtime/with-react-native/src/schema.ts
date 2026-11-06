import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const todos = pgTable("realtime_todos", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
