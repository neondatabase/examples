// From guides/subscribing.md "Listen for changes". Not imported by the app
import type {
  LiveQueryBatchInfo,
  LiveQueryChange,
  LiveQueryState,
  RawLiveQueryRow,
} from "@neon/realtime/client";

import type { Message } from "../backend/schema";
import { fetchSealedMessages } from "./api";
import { client } from "./client";

const channelId = 2;

// Keyed by rowId, which is only valid until the next reset
const rows = new Map<string, Message>();

const subscription = client.subscribe(await fetchSealedMessages(channelId), {
  materialize: false,
});

subscription.onReset((reset: readonly RawLiveQueryRow<Message>[]) => {
  rows.clear();

  for (const { rowId, row } of reset) {
    rows.set(rowId, row);
  }
});

subscription.onBatch(
  (changes: readonly LiveQueryChange<Message>[], batch: LiveQueryBatchInfo) => {
    for (const change of changes) {
      if (change.type === "upsert") {
        rows.set(change.rowId, change.row);
      } else {
        rows.delete(change.rowId);
      }
    }

    console.log(
      `${rows.size} messages after transactions ${batch.txids.join(", ")}`,
    );
  },
);

subscription.onStateChange((state: LiveQueryState) => {
  console.log(state.status, state.error?.message ?? "");
});
