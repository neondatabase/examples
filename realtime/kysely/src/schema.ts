import type { Generated, Selectable } from "kysely";

export interface TodoTable {
  id: Generated<number>;
  title: string;
  status: "active" | "completed";
}

export interface Database {
  realtime_todos: TodoTable;
}

export type Todo = Selectable<TodoTable>;
