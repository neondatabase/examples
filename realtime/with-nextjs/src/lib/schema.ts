import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// The single schema source: the app and `drizzle-kit push` both read it. Columns are declared snake_case
// on purpose. Realtime builds live rows from PostgreSQL's result names, so a camelCase JS property that
// mapped to a different column would give live rows different keys from server rows.
export const todos = pgTable(
  "realtime_next_todos",
  {
    // uuid, created in the browser, so the optimistic row and the live row share it. This primary key is
    // the replica identity Realtime needs.
    id: uuid("id").primaryKey(),
    // uuid, the Managed Better Auth user id; only ever set from the session. No foreign key to
    // neon_auth."user": this app doesn't manage the neon_auth schema.
    user_id: uuid("user_id").notNull(),
    title: text("title").notNull(),
    completed: boolean("completed").notNull().default(false),
    // timestamptz: pg and the Realtime client both parse it to a Date.
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Supports the `WHERE user_id = … ORDER BY created_at DESC` live query.
  (t) => [
    index("realtime_next_todos_user_id_created_at_idx").on(
      t.user_id,
      t.created_at,
    ),
  ],
);

export type Todo = typeof todos.$inferSelect;
