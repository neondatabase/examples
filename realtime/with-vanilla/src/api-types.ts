import type { SealedLiveQuery } from "@neon/realtime/client";

import type { Todo } from "./schema.js";

export interface LiveTodosResponse {
  readonly query: SealedLiveQuery<Todo>;
  readonly websocketUrl: string;
}

export interface CreateTodoResponse {
  readonly id: number;
  readonly txid: string;
}

export interface MutationResponse {
  readonly txid: string;
}
