import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";

import { pool } from "~/server/db.server";

// Mastra keeps its threads, messages, and trace spans in the app's own
// database, in the `public` schema with the `mastra_` prefix, so Neon Realtime
// can sync them like any other table. This is the standard `PostgresStore`, not
// `PostgresStoreVNext`: VNext writes its spans to `mastra_span_events`, a
// partitioned table outside the synced set.
//
// Importing this module, or an agent module that calls `getMemory()` at load,
// needs `DATABASE_URL`, because `db.server.ts` reads it when it loads.

// Spans older than this are deleted. Each lead's spans also go when the lead is
// deleted (`deleteLeadThread`), so retention only bounds the rest.
const SPAN_MAX_AGE = "7d";
const PRUNE_EVERY_MS = 60 * 60 * 1000;

// Cached on globalThis so that Vite's hot reload reuses one store instead of
// building another on every edit.
const globalMastraStorage = globalThis as typeof globalThis & {
  livebaseMastraStore?: PostgresStore;
  livebaseMastraMemory?: Memory;
};

export function getStore(): PostgresStore {
  const existing = globalMastraStorage.livebaseMastraStore;
  if (existing) return existing;

  const store = new PostgresStore({
    id: "livebase-storage",
    // The app's pool, so Mastra doesn't open a second one. The store doesn't
    // own it, so it never ends it.
    pool,
    schemaName: "public",
    // `npm run db:setup` creates and migrates Mastra's tables up front, so
    // request handling never races a migration.
    disableInit: true,
    retention: { observability: { spans: { maxAge: SPAN_MAX_AGE } } },
  });
  globalMastraStorage.livebaseMastraStore = store;
  startPruning(store);
  return store;
}

// Runs `prune()` hourly in this process. Each call deletes in bounded batches.
// Several instances can each run it: overlapping runs only repeat work. The
// timer is unref'd, so it never holds the process open.
function startPruning(store: PostgresStore): void {
  const timer = setInterval(() => {
    store.prune().catch((error: unknown) => {
      console.error("[mastra] pruning expired rows failed", error);
    });
  }, PRUNE_EVERY_MS);
  timer.unref();
}

export function getMemory(): Memory {
  const memory = globalMastraStorage.livebaseMastraMemory ?? new Memory({
    storage: getStore(),
    // A lead's thread records what its agents did; it isn't a conversation to
    // recall. Turning recall off keeps every call to a single prompt and
    // avoids extra queries and tokens.
    options: {
      lastMessages: false,
      semanticRecall: false,
      workingMemory: { enabled: false },
      generateTitle: false,
    },
  });
  globalMastraStorage.livebaseMastraMemory = memory;
  return memory;
}
