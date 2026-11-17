import type { SealedLiveQuery } from "@neon/realtime/client";

import type { Todo } from "./schema";

export type SealedTodosQuery = SealedLiveQuery<Todo>;

export interface CreateTodoRequest {
  readonly title: string;
}

export interface UpdateTodoRequest {
  readonly status: Todo["status"];
}
