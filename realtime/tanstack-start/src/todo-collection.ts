import { collectionOptions } from "@tanstack/react-db";
import { realtimeCollectionOptions } from "@neon/realtime-tanstack";
import type { SealedLiveQuery, RealtimeClient } from "@neon/realtime/client";

import {
  sealTodos,
  deleteTodo,
  insertTodo,
  updateTodo,
} from "./server-functions";
import type { Todo } from "./schema";

export function createTodoCollection(
  client: RealtimeClient,
  query: SealedLiveQuery<Todo>,
) {
  return collectionOptions(
    realtimeCollectionOptions({
      id: "realtime-todos",
      client,
      query,
      refreshQuery: () => sealTodos(),
      getKey: (todo) => todo.id,
      onInsert: async ({ transaction, collection }) => {
        const result = await insertTodo({
          data: transaction.mutations[0].modified,
        });
        await collection.utils.awaitTxId(result.txid);
      },
      onUpdate: async ({ transaction, collection }) => {
        const { id, status } = transaction.mutations[0].modified;
        const result = await updateTodo({ data: { id, status } });
        await collection.utils.awaitTxId(result.txid);
      },
      onDelete: async ({ transaction, collection }) => {
        const result = await deleteTodo({
          data: transaction.mutations[0].original.id,
        });
        await collection.utils.awaitTxId(result.txid);
      },
    }),
  );
}
