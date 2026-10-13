import type { RealtimeClient, SealedLiveQuery } from "@neon/realtime/client";
import { realtimeCollectionOptions } from "@neon/realtime-tanstack";
import { collectionOptions } from "@tanstack/react-db";

import type { Todo } from "./schema";
import {
  createTodos,
  deleteTodos,
  refreshTodosQuery,
  updateTodos,
} from "./todos.functions";

// How long a write waits for its own change to come back over Realtime. Keep it
// short: while a handler waits, TanStack DB holds back the collection's synced
// changes, including other tabs' writes.
const ECHO_TIMEOUT_MS = 10_000;

// The write committed, but its change didn't come back over Realtime in time,
// for example while live updates reconnect. TanStack DB still rolls the change
// back, and it shows again once Realtime catches up.
export class NotSyncedYetError extends Error {}

// A cheap descriptor, built by the loader and the page alike. The factory runs
// once per DbClient, with the Realtime client `getRouter` gave that DbClient.
export function todosCollection(userId: string, query: SealedLiveQuery<Todo>) {
  const id = `todos:${userId}`;
  return collectionOptions(id, (db) =>
    realtimeCollectionOptions({
      id,
      query,
      client: db.requireDependency<RealtimeClient>("realtime"),
      getKey: (todo) => todo.id,
      // Never garbage-collect while the page is open. A collection rebuilt
      // later would start empty, from this long-expired sealed query, and stay
      // `stale` until a refresh replaced it.
      gcTime: 0,
      refreshQuery: () =>
        refreshTodosQuery({ data: { userId } }).catch(leaveOnAuthLoss),
      // One server call per transaction, with all of its mutations. Each also
      // sends `userId`, so the server refuses writes from a page loaded for
      // another user.
      onInsert: async ({ transaction, collection }) => {
        const { txid } = await createTodos({
          data: {
            userId,
            batch: transaction.mutations.map(
              ({ modified: { id, title, completed } }) => ({
                id,
                title,
                completed,
              }),
            ),
          },
        }).catch(leaveOnAuthLoss);
        if (txid)
          await collection.utils
            .awaitTxId(txid, ECHO_TIMEOUT_MS)
            .catch(notSyncedYet);
      },
      onUpdate: async ({ transaction, collection }) => {
        const { txid } = await updateTodos({
          data: {
            userId,
            // The server keeps only `title` and `completed` from `changes`.
            batch: transaction.mutations.map(({ key, changes }) => ({
              id: key,
              changes,
            })),
          },
        }).catch(leaveOnAuthLoss);
        if (txid)
          await collection.utils
            .awaitTxId(txid, ECHO_TIMEOUT_MS)
            .catch(notSyncedYet);
      },
      onDelete: async ({ transaction, collection }) => {
        const { txid } = await deleteTodos({
          data: { userId, batch: transaction.mutations.map(({ key }) => key) },
        }).catch(leaveOnAuthLoss);
        if (txid)
          await collection.utils
            .awaitTxId(txid, ECHO_TIMEOUT_MS)
            .catch(notSyncedYet);
      },
    }),
  );
}

function notSyncedYet(cause: unknown): never {
  throw new NotSyncedYetError("Saved, but not synced yet", { cause });
}

// Signed out, or signed in as someone else: this page's rows and live query
// no longer apply, so go to sign-in with a full page load. Browser only.
function leaveOnAuthLoss(error: unknown): never {
  if (/UNAUTHORIZED|SESSION_CHANGED/.test(String(error))) {
    window.location.assign("/auth/sign-in");
  }
  throw error;
}
