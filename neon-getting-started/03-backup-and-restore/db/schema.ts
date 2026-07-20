import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  date,
} from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const todos = pgTable("todos", {
  id: uuid("id").defaultRandom().primaryKey(),
  text: text("text").notNull(),
  completed: boolean("completed").default(false).notNull(),
  dueDate: date("due_date"),
  // Intentionally NOT a foreign key. If the categories table is dropped,
  // existing todos keep their category_id values as dangling UUIDs and the
  // todos table continues to work — the app just falls back to "Uncategorized".
  categoryId: uuid("category_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Todo = typeof todos.$inferSelect;
export type Category = typeof categories.$inferSelect;
