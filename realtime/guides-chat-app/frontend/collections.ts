// From guides/mutations.md "With TanStack DB collections"
import { createCollection } from "@tanstack/react-db";
import { realtimeCollectionOptions } from "@neon/realtime-tanstack";
import type { SealedLiveQuery } from "@neon/realtime/client";

import type { Message } from "../backend/schema";
import {
  deleteMessages,
  editMessages,
  fetchSealedInbox,
  sendMessages,
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
        const result = await sendMessages(
          transaction.mutations.map(({ modified }) => modified),
        );

        if (result.kind === "committed") {
          await collection.utils.awaitTxId(result.txid, 10_000);
        }
      },
      onUpdate: async ({ transaction, collection }) => {
        const result = await editMessages(
          transaction.mutations.map(({ modified: { id, body } }) => ({
            id,
            body,
          })),
        );

        if (result.kind === "committed") {
          await collection.utils.awaitTxId(result.txid, 10_000);
        }
      },
      onDelete: async ({ transaction, collection }) => {
        const result = await deleteMessages(
          transaction.mutations.map(({ original }) => original.id),
        );

        if (result.kind === "committed") {
          await collection.utils.awaitTxId(result.txid, 10_000);
        }
      },
    }),
  );
}

export type MessagesCollection = ReturnType<typeof createMessagesCollection>;
