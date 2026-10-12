import type { RealtimeClient, SealedLiveQuery } from "@neon/realtime/client";
import { realtimeCollectionOptions } from "@neon/realtime-tanstack";
import { collectionOptions } from "@tanstack/react-db";

import {
  deleteTodo,
  insertTodo,
  refreshTodosQuery,
  updateTodo,
} from "./server-functions";
import type { Todo } from "./schema";

export function createTodoCollection(
  client: RealtimeClient,
  query: SealedLiveQuery<Todo>,
) {
  return collectionOptions(
    realtimeCollectionOptions({
      id: "neon-realtime-todos",
      client,
      query,
      refreshQuery: () => refreshTodosQuery(),
      getKey: (todo) => todo.id,
      onInsert: async ({ transaction, collection }) => {
        const result = await insertTodo({
          data: transaction.mutations[0].modified,
        });
        await collection.utils.awaitTxId(result.txid, 10_000);
      },
      onUpdate: async ({ transaction, collection }) => {
        const { id, completed } = transaction.mutations[0].modified;
        const result = await updateTodo({ data: { id, completed } });
        await collection.utils.awaitTxId(result.txid, 10_000);
      },
      onDelete: async ({ transaction, collection }) => {
        const result = await deleteTodo({
          data: transaction.mutations[0].original.id,
        });
        await collection.utils.awaitTxId(result.txid, 10_000);
      },
    }),
  );
}
