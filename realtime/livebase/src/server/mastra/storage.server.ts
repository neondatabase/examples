import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";

// Mastra keeps its threads, messages, and trace spans in the app's own
// database, in the default `public` schema with the `mastra_` prefix, so Neon
// Realtime can sync them like any other table. This is the standard
// `PostgresStore`, not `PostgresStoreVNext`: VNext partitions its span table
// and only writes a span once it ends, which would hide running steps.

// Cached on globalThis so that Vite's hot reload reuses one connection pool
// instead of opening another on every edit.
const globalMastraStorage = globalThis as typeof globalThis & {
  livebaseMastraStore?: PostgresStore;
  livebaseMastraMemory?: Memory;
};

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export function getStore(): PostgresStore {
  const store = globalMastraStorage.livebaseMastraStore ?? new PostgresStore({
    id: "livebase-storage",
    connectionString: databaseUrl(),
    // `npm run db:setup` creates and migrates Mastra's tables up front, so
    // request handling never races a migration.
    disableInit: true,
  });
  globalMastraStorage.livebaseMastraStore = store;
  return store;
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
