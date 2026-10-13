// From guides/subscribing.md "Listen for changes". Not imported by the app
import type { LiveQueryState, RawLiveQueryUpdate } from "@neon/realtime/client";

import type { Message } from "../backend/schema";
import { fetchSealedMessages } from "./api";
import { client } from "./client";

const channelId = 2;

// Keyed by rowId, which is only valid until the next `rows` update
const rows = new Map<string, Message>();

const subscription = client.subscribe(await fetchSealedMessages(channelId), {
  materialize: false,
});

subscription.onUpdate((update: RawLiveQueryUpdate<Message>) => {
  if (update.type === "rows") {
    rows.clear();
    for (const { rowId, row } of update.rows) {
      rows.set(rowId, row);
    }
    return;
  }

  for (const change of update.changes) {
    if (change.type === "upsert") {
      rows.set(change.rowId, change.row);
    } else {
      rows.delete(change.rowId);
    }
  }

  console.log(
    `${rows.size} messages after transactions ${update.batch.txids.join(", ")}`,
  );
});

subscription.onStateChange((state: LiveQueryState) => {
  console.log(state.status, state.error?.message ?? "");
});
