import type { RealtimeLogEntry } from "@neon/realtime/client";

// Events that end the whole connection, not one subscription. Subscription
// failures (`subscription_error`, decode errors) reach only their own state.
// The names are the SDK's, and `connection-store.test.ts` pins them: the
// logger is the only place the SDK reports these.
const TERMINAL_EVENTS: ReadonlySet<string> = new Set([
  "connection_failed",
  "connection_reconnect_exhausted",
]);

export interface ConnectionStore {
  // Pass to the client's `logger`. Called for each entry its `logLevel` enables.
  readonly onEntry: (entry: RealtimeLogEntry) => void;
  readonly isFailed: () => boolean;
  // Listeners run once, when the connection fails.
  readonly subscribe: (listener: () => void) => () => void;
}

// One store per Realtime client. The failure never clears: the SDK doesn't
// reconnect after it, so only a reload brings live sync back.
export function createConnectionStore(): ConnectionStore {
  let failed = false;
  const listeners = new Set<() => void>();

  return {
    onEntry(entry) {
      if (failed || !TERMINAL_EVENTS.has(entry.event)) return;
      failed = true;
      for (const listener of listeners) listener();
    },
    isFailed: () => failed,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
