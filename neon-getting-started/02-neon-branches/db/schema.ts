import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  date,
} from "drizzle-orm/pg-core";

export const todos = pgTable("todos", {
  id: uuid("id").defaultRandom().primaryKey(),
  text: text("text").notNull(),
  completed: boolean("completed").default(false).notNull(),
  dueDate: date("due_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Todo = typeof todos.$inferSelect;
