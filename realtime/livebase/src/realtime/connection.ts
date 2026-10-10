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
import type { ConnectionStore } from "~/realtime/connection-store";
import { useRealtime } from "~/realtime/RealtimeProvider";

// Collections expose no stale flag (Neon's `stale` stays TanStack's `ready`),
// so a tiny subscription of our own reports the connection. Its state is its
// own: a failure ends this subscription, and the other collections may keep
// streaming. The SDK reports a connection-wide failure only through the
// logger, which `connection` receives.
export function useConnectionProbe(
  client: RealtimeClient,
  query: SealedLiveQuery<Workspace>,
  connection: ConnectionStore,
): ConnectionStatus {
  // Effects never run on the server, so SSR always renders `connecting`.
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const subscription = client.subscribe(query);
    let hasBeenLive = false;

    const update = () => {
      const state = subscription.getState();
      const connectionFailed = connection.isFailed();
      if (state.status === "live") hasBeenLive = true;
      // A failed subscription rejects every renewal, and each attempt bounces
      // it through `stale`. Stop refreshing, or it would retry every second.
      if (connectionFailed || hasFailed(state)) refresh.stop();
      setStatus(toConnectionStatus(state, hasBeenLive, navigator.onLine, connectionFailed));
    };

    // A direct subscription refreshes its own sealed query, or it fails once
    // the query expires.
    const refresh = new QueryRefreshController({
      query,
      subscription,
      refreshQuery: () => sealWorkspace(),
      renewSubscription: (next) => subscription.renew(next),
      // The client's logger already records `query_refresh_stopped` before this.
      onRefreshExhausted: () => undefined,
    });

    const stopListening = subscription.onStateChange(update);
    const stopConnection = connection.subscribe(update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    refresh.start();
    update();

    return () => {
      refresh.stop();
      stopListening();
      stopConnection();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      subscription.unsubscribe();
    };
  }, [client, query, connection]);

  return status;
}

export function useConnectionStatus(): ConnectionStatus {
  return useRealtime().connectionStatus;
}
