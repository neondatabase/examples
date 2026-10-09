import type { LiveQueryState } from "@neon/realtime/client";

import type { ConnectionStatus } from "~/lib/types";

// The client retries socket loss and retryable server errors itself, staying
// `stale` or `connecting` meanwhile. It reports `error` once it has stopped.
// A non-retryable error (one connection error fails every subscription on the
// shared socket) can't be renewed away, so only a reload helps. A retryable
// one waits for the next query refresh, so it is still recovering.
export function hasFailed(state: LiveQueryState): boolean {
  return state.status === "error" && !state.error.retryable;
}

export function toConnectionStatus(
  state: LiveQueryState,
  hasBeenLive: boolean,
  online: boolean,
): ConnectionStatus {
  if (!online) return "offline";
  if (hasFailed(state)) return "failed";
  if (state.status === "closed") return "offline";
  if (state.status === "live") return "live";
  // `stale`, `connecting` again, or a retryable `error`: still recovering.
  return hasBeenLive ? "reconnecting" : "connecting";
}
