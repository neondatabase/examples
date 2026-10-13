import type { Generated } from "kysely";

// Kysely's types for the table. scripts/migrate.mts creates it.
// Keys equal the column names. Realtime builds live rows from PostgreSQL's result names, so a
// result-transforming plugin such as CamelCasePlugin would give live rows different keys from server rows.
export interface TodosTable {
  id: string; // uuid, created in the browser, so the optimistic row and the live row share it
  user_id: string; // uuid, the Neon Auth user id; only ever set from the session
  title: string;
  completed: Generated<boolean>;
  created_at: Generated<Date>; // timestamptz: pg and the Realtime client both parse it to a Date
}

export interface Database {
  realtime_next_todos: TodosTable;
}
