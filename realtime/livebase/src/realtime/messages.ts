import { realtimeCollectionOptions } from "@neon/realtime-tanstack";
import { createCollection, eq, useLiveQuery } from "@tanstack/react-db";
import { useEffect, useState } from "react";

import type { MastraMessage } from "~/db/mastra-schema";
import { sealLeadMessages } from "~/functions/seal";
import { useRealtime } from "~/realtime/RealtimeProvider";
import { parseMessageContent, type ParsedMessage } from "~/realtime/message-content";

// A lead's Mastra messages carry the tool arguments and results that spans
// don't. They're synced on demand, per lead, while its activity panel is open,
// and are never part of the SSR state.

interface MessagesSnapshot {
  readonly leadId: string;
  readonly messages: readonly ParsedMessage[];
  readonly isReady: boolean;
}

const NO_MESSAGES: readonly ParsedMessage[] = [];

export function useLeadMessages(
  leadId: string,
  enabled: boolean,
): { messages: readonly ParsedMessage[]; isReady: boolean } {
  const { descriptors, realtimeClient } = useRealtime();
  // Mastra creates a lead's thread, whose ID is the lead ID, on the agent's
  // first run. Until then the lead has no messages, so there is nothing to
  // seal or sync. Collections sync only while something reads them, and
  // this is the threads collection's reader.
  const { data: thread, isReady: threadsReady } = useLiveQuery({
    query: (q) => q.from({ thread: descriptors.threads }).where(({ thread }) => eq(thread.id, leadId)).findOne(),
  });
  const hasThread = thread !== undefined;
  const [snapshot, setSnapshot] = useState<MessagesSnapshot | null>(null);

  useEffect(() => {
    if (!enabled || !hasThread) return;
    let active = true;
    let dispose: (() => void) | undefined;
    const refreshQuery = () => sealLeadMessages({ data: { leadId } });

    refreshQuery()
      .then((query) => {
        if (!active) return;
        const collection = createCollection(realtimeCollectionOptions({
          id: `livebase-mastra-messages-${leadId}`,
          client: realtimeClient,
          query,
          refreshQuery,
          getKey: (message) => message.id,
        }));
        const publish = () => {
          setSnapshot({ leadId, messages: toParsedMessages(collection.toArray), isReady: collection.isReady() });
        };
        // Subscribing starts the sync. An empty result emits no changes, so
        // readiness is published separately.
        const subscription = collection.subscribeChanges(publish, { includeInitialState: true });
        const stopReady = collection.onFirstReady(publish);
        publish();
        dispose = () => {
          stopReady();
          subscription.unsubscribe();
          void collection.cleanup();
        };
      })
      .catch((error: unknown) => {
        // Messages only add tool summaries; the timeline works without them.
        console.warn(`Could not load messages for lead ${leadId}`, error);
        if (active) setSnapshot({ leadId, messages: NO_MESSAGES, isReady: true });
      });

    return () => {
      active = false;
      dispose?.();
      // The next collection, even for the same lead, starts from nothing.
      setSnapshot(null);
    };
  }, [enabled, hasThread, leadId, realtimeClient]);

  if (!enabled) return { messages: NO_MESSAGES, isReady: false };
  if (!hasThread) return { messages: NO_MESSAGES, isReady: threadsReady };
  // The lead changed and the effect hasn't cleared the old snapshot yet.
  if (!snapshot || snapshot.leadId !== leadId) return { messages: NO_MESSAGES, isReady: false };
  return { messages: snapshot.messages, isReady: snapshot.isReady };
}

function toParsedMessages(rows: readonly MastraMessage[]): ParsedMessage[] {
  return rows
    .map((row) => ({ id: row.id, createdAt: row.createdAt, ...parseMessageContent(row.content) }))
    .sort((a, b) => time(a.createdAt) - time(b.createdAt));
}

// Unknown times sort last.
function time(date: Date | null): number {
  return date ? date.getTime() : Number.POSITIVE_INFINITY;
}
