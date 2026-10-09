import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const todos = pgTable("realtime_todos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
});
