import type { LiveQueryState } from "@neon/realtime/client";

import type { ConnectionStatus } from "~/lib/types";

// The SDK reports every subscription `error` as final: a failed subscription
// never recovers by itself, so only a reload helps. Socket loss and retryable
// server errors stay `stale` or `connecting` while the client renews.
export function hasFailed(state: LiveQueryState): boolean {
  return state.status === "error";
}

// `connectionFailed` is connection-wide (see `connection-store.ts`). A failed
// probe alone is `stopped`: this one subscription ended, so other collections
// may still stream.
export function toConnectionStatus(
  state: LiveQueryState,
  hasBeenLive: boolean,
  online: boolean,
  connectionFailed: boolean,
): ConnectionStatus {
  if (!online) return "offline";
  if (connectionFailed) return "failed";
  if (hasFailed(state)) return "stopped";
  if (state.status === "closed") return "offline";
  if (state.status === "live") return "live";
  // `stale` or `connecting` again: still recovering.
  return hasBeenLive ? "reconnecting" : "connecting";
}
