import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";

export const todos = pgTable("realtime_todos", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
});

export type Todo = typeof todos.$inferSelect;
