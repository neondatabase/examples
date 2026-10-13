// From guides/mutations.md "Without a framework". Not imported by the app
import type {
  LiveQueryState,
  MaterializedLiveQuerySubscription,
} from "@neon/realtime/client";

import type { Message } from "../backend/schema";
import {
  applyMutation,
  type MessageMutation,
  type OptimisticMessage,
  writeMutation,
} from "./mutations";

export function optimisticMessages(
  subscription: MaterializedLiveQuerySubscription<Message>,
  render: (
    messages: readonly OptimisticMessage[],
    state: LiveQueryState,
    error: string | undefined,
  ) => void,
) {
  // A Map keeps insertion order, so mutations apply in the order they were made
  const pending = new Map<number, MessageMutation>();
  let nextKey = 0;
  let error: string | undefined;
  let stopped = false;

  function update() {
    if (stopped) {
      return;
    }

    const snapshot = subscription.getSnapshot();
    const synced: readonly OptimisticMessage[] = snapshot.data ?? [];

    render(
      [...pending.values()].reduce(applyMutation, synced),
      snapshot,
      error,
    );
  }

  async function mutate(mutation: MessageMutation) {
    const key = nextKey++;

    error = undefined;
    pending.set(key, mutation);
    update();

    try {
      const result = await writeMutation(mutation);

      if (result.kind === "committed") {
        await subscription.awaitTxId(result.txid, 10_000);
      }
    } catch {
      error = "Couldn't confirm the change";
    } finally {
      pending.delete(key);
      update();
    }
  }

  const unsubscribe = subscription.onChange(update);

  update();

  return {
    mutate,
    stop: () => {
      stopped = true;
      unsubscribe();
    },
  };
}
