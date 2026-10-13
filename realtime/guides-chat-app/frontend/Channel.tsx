// From guides/reactivity.md "Changing query parameters" and mutations.md "With React's useOptimistic hook"
import { useCallback, useEffect, useState } from "react";
import type { SealedLiveQuery } from "@neon/realtime/client";

import type { Message } from "../backend/schema";
import { fetchSealedMessages } from "./api";
import { Messages } from "./Messages";

interface SealedChannel {
  channelId: number;
  sealedQuery?: SealedLiveQuery<Message>;
  error?: unknown;
}

function useSealedQuery(channelId: number): SealedChannel | undefined {
  const [sealed, setSealed] = useState<SealedChannel>();

  useEffect(() => {
    let cancelled = false;

    fetchSealedMessages(channelId).then(
      (sealedQuery) => {
        if (!cancelled) setSealed({ channelId, sealedQuery });
      },
      (error: unknown) => {
        if (!cancelled) setSealed({ channelId, error });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [channelId]);

  // Never hand the previous channel's sealed query to the new channel
  return sealed?.channelId === channelId ? sealed : undefined;
}

export function Channel({
  channelId,
  userId,
}: {
  channelId: number;
  userId: string;
}) {
  const sealed = useSealedQuery(channelId);
  // Renewals must be for the same query, so refresh with the same channel
  const refreshQuery = useCallback(
    () => fetchSealedMessages(channelId),
    [channelId],
  );

  if (sealed?.sealedQuery) {
    return (
      <Messages
        sealedQuery={sealed.sealedQuery}
        refreshQuery={refreshQuery}
        channelId={channelId}
        userId={userId}
      />
    );
  }

  if (sealed?.error) {
    return <p role="alert">Couldn't open this channel</p>;
  }

  return <p>Loading messages</p>;
}
