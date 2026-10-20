import type { Generated, Selectable } from "kysely";

// Kysely's types for the table. src/setup.ts creates it.
// Keys equal the column names: Realtime builds live rows from PostgreSQL's result names, so the
// live rows and the rows the server reads share the same keys.
export interface TodosTable {
  id: Generated<number>; // SERIAL PRIMARY KEY
  title: string;
  completed: Generated<boolean>; // defaults to false
}

export interface Database {
  realtime_todos: TodosTable;
}

// The row the live query returns. Kysely infers it from the table instead of a handwritten
// interface, keeping the `{ id, title, completed }` shape that api-types.ts and the client import.
export type Todo = Selectable<Database["realtime_todos"]>;
