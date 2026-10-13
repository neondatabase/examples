import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const todos = pgTable(
  "realtime_todos",
  {
    // Generated in the browser, so an optimistic insert already has its key.
    id: uuid("id").primaryKey(),
    // The Neon Auth user id. Set on the server only; never sent to the browser.
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    completed: boolean("completed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("realtime_todos_user_id_idx").on(t.userId)],
);
