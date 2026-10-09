import { useEffect, useState } from "react";
import {
  QueryRefreshController,
  type SealedLiveQuery,
  type RealtimeClient,
} from "@neon/realtime/client";

import type { Workspace } from "~/db/schema";
import { sealWorkspace } from "~/functions/seal";
import type { ConnectionStatus } from "~/lib/types";
import { hasFailed, toConnectionStatus } from "~/realtime/connection-status";
import { useRealtime } from "~/realtime/RealtimeProvider";

// Collections expose no stale flag (Neon's `stale` stays TanStack's `ready`),
// so a tiny subscription of our own reports the connection. It shares the
// client's single WebSocket, so its state is the socket's state.
export function useConnectionProbe(
  client: RealtimeClient,
  query: SealedLiveQuery<Workspace>,
): ConnectionStatus {
  // Effects never run on the server, so SSR always renders `connecting`.
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const subscription = client.subscribe(query);
    let hasBeenLive = false;

    const update = () => {
      const state = subscription.getState();
      if (state.status === "live") hasBeenLive = true;
      // A failed subscription rejects every renewal, and each attempt bounces
      // it through `stale`. Stop refreshing, or it would retry every second.
      if (hasFailed(state)) refresh.stop();
      setStatus(toConnectionStatus(state, hasBeenLive, navigator.onLine));
    };

    // Collections refresh their own sealed queries. A direct subscription has
    // to do it explicitly, or it would fail once the sealed query expires.
    const refresh = new QueryRefreshController({
      query,
      refreshQuery: () => sealWorkspace(),
      renewSubscription: (next) => subscription.renew(next),
      onRefreshExhausted: (error) => {
        console.error("Stopped refreshing the connection probe's query", error);
      },
    });

    const stopListening = subscription.onStateChange(update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    refresh.start();
    update();

    return () => {
      refresh.stop();
      stopListening();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      subscription.unsubscribe();
    };
  }, [client, query]);

  return status;
}

export function useConnectionStatus(): ConnectionStatus {
  return useRealtime().connectionStatus;
}
