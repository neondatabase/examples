import { jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// Read-only views of the Mastra tables that Livebase syncs. Mastra creates and
// migrates these tables itself; `drizzle.config.ts` never loads this file. Only
// the selected columns are declared, so `getTableColumns()` yields the narrow
// live-query projection. Camel-case columns are quoted in SQL, and the `*Z`
// columns are Mastra's timestamptz twins.

export const mastraThreads = pgTable("mastra_threads", {
  id: text("id").primaryKey(),
  resourceId: text("resourceId").notNull(),
  title: text("title").notNull(),
  createdAt: timestamp("createdAtZ", { withTimezone: true }),
  updatedAt: timestamp("updatedAtZ", { withTimezone: true }),
});

export const mastraMessages = pgTable("mastra_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  resourceId: text("resourceId"),
  role: text("role").notNull(),
  type: text("type").notNull(),
  // Format 2 message JSON stored as text. The client parses it.
  content: text("content").notNull(),
  createdAt: timestamp("createdAtZ", { withTimezone: true }),
});

export interface MastraSpanError {
  readonly message?: string;
  readonly name?: string;
  readonly id?: string;
  readonly domain?: string;
  readonly category?: string;
  // `spansQuery` drops `stack` before the row syncs, since it holds server file
  // paths. The other fields sync to every browser.
  readonly stack?: string;
  readonly details?: Record<string, string | number | boolean | null>;
}

export const mastraAiSpans = pgTable("mastra_ai_spans", {
  traceId: text("traceId").notNull(),
  spanId: text("spanId").notNull(),
  parentSpanId: text("parentSpanId"),
  name: text("name").notNull(),
  spanType: text("spanType").notNull(),
  entityType: text("entityType"),
  entityId: text("entityId"),
  entityName: text("entityName"),
  resourceId: text("resourceId"),
  threadId: text("threadId"),
  runId: text("runId"),
  startedAt: timestamp("startedAtZ", { withTimezone: true }),
  endedAt: timestamp("endedAtZ", { withTimezone: true }),
  error: jsonb("error").$type<MastraSpanError | null>(),
}, (table) => [primaryKey({ columns: [table.traceId, table.spanId] })]);

export const SYNCED_MASTRA_TABLE_NAMES = ["mastra_threads", "mastra_ai_spans", "mastra_messages"] as const;

export type MastraThread = typeof mastraThreads.$inferSelect;
export type MastraMessage = typeof mastraMessages.$inferSelect;
export type MastraSpan = typeof mastraAiSpans.$inferSelect;
