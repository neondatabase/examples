import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const todos = pgTable("realtime_todos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status", { enum: ["active", "completed"] }).notNull(),
});

export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
