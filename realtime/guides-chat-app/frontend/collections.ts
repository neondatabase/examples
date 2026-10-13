// From guides/mutations.md "With TanStack DB collections"
import { createCollection } from "@tanstack/react-db";
import { realtimeCollectionOptions } from "@neon/realtime-tanstack";
import type { SealedLiveQuery } from "@neon/realtime/client";

import type { Message } from "../backend/schema";
import {
  deleteMessage,
  editMessage,
  fetchSealedInbox,
  sendMessage,
} from "./api";
import { client } from "./client";

export function createMessagesCollection(
  sealedQuery: SealedLiveQuery<Message>,
) {
  return createCollection(
    realtimeCollectionOptions({
      id: "messages",
      client,
      query: sealedQuery,
      refreshQuery: fetchSealedInbox,
      getKey: (message) => message.id,
      onInsert: async ({ transaction, collection }) => {
        const result = await sendMessage(transaction.mutations[0].modified);

        if (result.kind === "committed") {
          await collection.utils.awaitTxId(result.txid, 10_000);
        }
      },
      onUpdate: async ({ transaction, collection }) => {
        const { id, body } = transaction.mutations[0].modified;
        const result = await editMessage(id, body);

        if (result.kind === "committed") {
          await collection.utils.awaitTxId(result.txid, 10_000);
        }
      },
      onDelete: async ({ transaction, collection }) => {
        const result = await deleteMessage(
          transaction.mutations[0].original.id,
        );

        if (result.kind === "committed") {
          await collection.utils.awaitTxId(result.txid, 10_000);
        }
      },
    }),
  );
}

export type MessagesCollection = ReturnType<typeof createMessagesCollection>;
