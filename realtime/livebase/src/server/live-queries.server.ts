import { and, eq, getTableColumns, sql, type InferSelectModel, type SQL, type Table } from "drizzle-orm";

import { mastraAiSpans, mastraMessages, mastraThreads, type MastraSpanError } from "~/db/mastra-schema";
import { companies, findings, leadInputs, leads, people, workspaces } from "~/db/schema";

import { db } from "./db.server";

// Every live query in Livebase. They are plain equality filters on base
// tables, which Neon Realtime maintains incrementally. Sorting, joining, and
// aggregation happen in the browser, in TanStack DB. There is no ORDER BY or
// LIMIT here, and `live-queries.server.test.ts` checks that. Neon Realtime
// supports both, but each write to a source table resets the subscription and
// re-baselines it, so the sort and the limit go in TanStack DB instead.
//
// Each builder returns an un-awaited Drizzle select. Await it for SSR rows,
// or pass it to `realtime.seal({ query })` to seal it for a subscription.
// Both come from the same builder, so SSR and live rows have the same shape.

type AliasedColumns<T extends Table> = {
  [K in keyof InferSelectModel<T>]: SQL.Aliased<InferSelectModel<T>[K]>;
};

// Neon Realtime returns PostgreSQL's result names, which must equal the Drizzle
// keys, so each column is aliased to its key (`"workspace_id" AS
// "workspaceId"`). `.mapWith(column)` keeps the column's decoder, so rows are
// still the table's `$inferSelect`.
function allColumns<T extends Table>(table: T): AliasedColumns<T> {
  return Object.fromEntries(
    Object.entries(getTableColumns(table)).map(([key, column]) => [key, sql`${column}`.mapWith(column).as(key)]),
  ) as AliasedColumns<T>;
}

export const leadsQuery = (workspaceId: string) => db
  .select(allColumns(leads))
  .from(leads)
  .where(eq(leads.workspaceId, workspaceId));

export const peopleQuery = (workspaceId: string) => db
  .select(allColumns(people))
  .from(people)
  .where(eq(people.workspaceId, workspaceId));

export const companiesQuery = (workspaceId: string) => db
  .select(allColumns(companies))
  .from(companies)
  .where(eq(companies.workspaceId, workspaceId));

export const leadInputsQuery = (workspaceId: string) => db
  .select(allColumns(leadInputs))
  .from(leadInputs)
  .where(eq(leadInputs.workspaceId, workspaceId));

export const findingsQuery = (workspaceId: string) => db
  .select(allColumns(findings))
  .from(findings)
  .where(eq(findings.workspaceId, workspaceId));

// Mastra scopes threads and spans by `resourceId`, which Livebase sets to the
// workspace ID.
export const threadsQuery = (workspaceId: string) => db
  .select(allColumns(mastraThreads))
  .from(mastraThreads)
  .where(eq(mastraThreads.resourceId, workspaceId));

// A tool span's `attributes` hold its tool call's ID, which is how the activity
// timeline finds the call's input and result in the lead's messages
// (`attachToolDetails`). Only that one value is projected, so the rest of
// `attributes` stays off the wire. `->>` is immutable, which Neon Realtime
// requires of a computed column; it means the spans subscription evaluates an
// expression on each change. The key is a literal, not a bind parameter, so the
// query keeps its one parameter, the workspace ID.
//
// `error` is projected without its `stack`, which holds server file paths. `-`
// drops the key and is immutable too.
export const spansQuery = (workspaceId: string) => db
  .select({
    ...allColumns(mastraAiSpans),
    toolCallId: sql<string | null>`${mastraAiSpans}."attributes" ->> 'toolCallId'`.as("toolCallId"),
    error: sql<MastraSpanError | null>`${mastraAiSpans}."error" - 'stack'`.mapWith(mastraAiSpans.error).as("error"),
  })
  .from(mastraAiSpans)
  .where(eq(mastraAiSpans.resourceId, workspaceId));

// A single row whose subscription state drives the connection indicator.
export const workspaceQuery = (workspaceId: string) => db
  .select(allColumns(workspaces))
  .from(workspaces)
  .where(eq(workspaces.id, workspaceId));

// Each lead has one Mastra thread whose ID is the lead ID. Messages are scoped
// to it, so a page subscribes only to the conversation it shows. The workspace
// filter keeps a guessed lead ID from reading another workspace's messages.
export const messagesQuery = (workspaceId: string, leadId: string) => db
  .select(allColumns(mastraMessages))
  .from(mastraMessages)
  .where(and(eq(mastraMessages.resourceId, workspaceId), eq(mastraMessages.threadId, leadId)));
