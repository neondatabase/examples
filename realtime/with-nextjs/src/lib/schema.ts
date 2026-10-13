import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// TS keys equal the column names: @neon/realtime-drizzle rejects a key that differs from its column, and
// Drizzle's `casing` option would quietly give live rows different keys from server rows.
export const todos = pgTable(
  "realtime_next_todos",
  {
    id: uuid("id").primaryKey(), // created in the browser, so the optimistic row and the live row share it
    user_id: uuid("user_id").notNull(), // the Neon Auth user id; only ever set from the session
    title: text("title").notNull(),
    completed: boolean("completed").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("realtime_next_todos_user_id_created_at_idx").on(
      t.user_id,
      t.created_at,
    ),
  ],
);
// The primary key is the replica identity Realtime needs. No foreign key to neon_auth."user":
// drizzle-kit must not manage the neon_auth schema.
