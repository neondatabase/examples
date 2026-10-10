import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RealtimeLogEntry } from "@neon/realtime/client";

import { createConnectionStore } from "~/realtime/connection-store";

// Only the fields the store reads. The SDK's `event` names are pinned here, so
// an SDK rename fails this test instead of silently hiding a dead connection.
function entry(event: string): RealtimeLogEntry {
  return { level: "error", event, message: event, timestamp: 0 } as RealtimeLogEntry;
}

describe("createConnectionStore", () => {
  it("fails on connection_failed", () => {
    const store = createConnectionStore();
    store.onEntry(entry("connection_failed"));
    assert.equal(store.isFailed(), true);
  });

  it("fails on connection_reconnect_exhausted", () => {
    const store = createConnectionStore();
    store.onEntry(entry("connection_reconnect_exhausted"));
    assert.equal(store.isFailed(), true);
  });

  it("ignores subscription-scoped and recoverable events", () => {
    const store = createConnectionStore();
    for (const event of ["connection_lost", "query_expired", "subscription_renewal_failed", "query_refresh_stopped"]) {
      store.onEntry(entry(event));
    }
    assert.equal(store.isFailed(), false);
  });

  it("notifies listeners once, and stops after unsubscribe", () => {
    const store = createConnectionStore();
    let calls = 0;
    const stop = store.subscribe(() => calls++);
    store.onEntry(entry("connection_failed"));
    store.onEntry(entry("connection_failed"));
    assert.equal(calls, 1);

    const other = createConnectionStore();
    const stopOther = other.subscribe(() => calls++);
    stopOther();
    other.onEntry(entry("connection_failed"));
    assert.equal(calls, 1);
    stop();
  });
});
