import "dotenv/config";

import { PostgresStore } from "@mastra/pg";
import { getTableColumns, type Table } from "drizzle-orm";

import {
  mastraAiSpans,
  mastraMessages,
  mastraThreads,
  SYNCED_MASTRA_TABLE_NAMES,
} from "~/db/mastra-schema";
import { DOMAIN_TABLE_NAMES, users, workspaces } from "~/db/schema";
import {
  DEMO_USER_EMAIL,
  DEMO_USER_ID,
  DEMO_USER_NAME,
  DEMO_WORKSPACE_ID,
  DEMO_WORKSPACE_NAME,
} from "~/lib/constants";

import { db, pool } from "./db.server";

// `npm run db:setup` runs this after `drizzle-kit push` has created the domain
// tables. Every step is idempotent, so it is safe to run again.

type MastraTableName = (typeof SYNCED_MASTRA_TABLE_NAMES)[number];

// The read-only Drizzle views, so that the column check covers exactly the
// columns the live queries select.
const MASTRA_TABLES: Record<MastraTableName, Table> = {
  mastra_threads: mastraThreads,
  mastra_ai_spans: mastraAiSpans,
  mastra_messages: mastraMessages,
};

// Columns that live queries read through raw SQL, which the Drizzle declarations
// don't cover. `spansQuery` reads `attributes` for its `->>` expression. Declaring
// the column on `mastraAiSpans` would sync all of `attributes`, so it's listed here.
const SQL_COLUMNS: Partial<Record<MastraTableName, readonly string[]>> = {
  mastra_ai_spans: ["attributes"],
};

// Mastra and the app create their tables here. Each check names the schema, so
// it inspects the tables the app uses whatever `search_path` is.
const SCHEMA = "public";

// `users` never leaves the server, so it isn't synced.
const SYNCED_DOMAIN_TABLE_NAMES = DOMAIN_TABLE_NAMES.filter((name) => name !== "users");

const REPLICA_IDENTITIES: Record<string, string> = {
  d: "DEFAULT",
  n: "NOTHING",
  i: "USING INDEX",
  f: "FULL",
};

async function initMastraStorage(): Promise<void> {
  // The app turns off Mastra's lazy initialization, so this is where Mastra
  // creates and migrates its own tables. The store borrows the setup pool,
  // which `pool.end()` closes at the end of the script.
  await new PostgresStore({ id: "livebase-setup", pool, schemaName: SCHEMA }).init();
}

async function setReplicaIdentityFull(): Promise<number> {
  // `mastra_workflow_snapshot` is left alone: Mastra points its replica
  // identity at a unique constraint, and Livebase doesn't sync it.
  const names = [...DOMAIN_TABLE_NAMES, ...SYNCED_MASTRA_TABLE_NAMES];
  for (const name of names) {
    // IF EXISTS so that a table a Mastra upgrade renamed is reported by
    // `checkSyncedTables` along with every other problem.
    await pool.query(`ALTER TABLE IF EXISTS "${SCHEMA}"."${name}" REPLICA IDENTITY FULL`);
  }
  return names.length;
}

// TEMPORARY workaround for a Neon Realtime bug. Its pipeline worker fails
// with "Change preparation failed", and every live session drops, on some
// transactions that write a value stored out of line (external TOAST): Mastra's
// multi-row upserts of spans and messages, and `createLead`'s insert of a lead
// with its input. Postgres moves values out of line once a row passes about
// 2 KB, so every agent run and every note over about 3,000 characters hit it.
// STORAGE MAIN keeps values in the row, compressed, unless the row can't fit
// in a page. It has to cover every column: with only the large ones on MAIN,
// Postgres moves the short text columns out of line instead. Remove this, and
// restore `maxStringLength` in `mastra.server.ts`, once Neon Realtime handles
// out-of-line values.
async function keepSyncedValuesInline(): Promise<number> {
  // This sets the storage of columns for rows written from now on. Postgres
  // doesn't rewrite existing rows, so a row that already holds an out-of-line
  // value keeps it. A compressed value that stays inline still triggers the reset,
  // so this narrows the problem; it doesn't fix it.
  const names = [...SYNCED_DOMAIN_TABLE_NAMES, ...SYNCED_MASTRA_TABLE_NAMES];
  // Only columns that may still go out of line, so a second run changes nothing.
  const result = await pool.query<{ statement: string }>(
    `SELECT format('ALTER TABLE %I.%I %s', n.nspname, c.relname,
              string_agg(format('ALTER COLUMN %I SET STORAGE MAIN', a.attname), ', ')) AS statement
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $2 AND c.relname = ANY($1)
        AND a.attnum > 0 AND NOT a.attisdropped AND a.attstorage IN ('x', 'e')
      GROUP BY n.nspname, c.relname`,
    [names, SCHEMA],
  );
  for (const { statement } of result.rows) await pool.query(statement);
  return names.length;
}

function columnNames(table: Table): string[] {
  return Object.values(getTableColumns(table)).map((column) => column.name);
}

// Returns what stops Neon Realtime from syncing the table.
async function tableProblems(name: string, selectedColumns: readonly string[]): Promise<string[]> {
  const relation = `${SCHEMA}.${name}`;
  const found = await pool.query<{ exists: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [relation],
  );
  if (!found.rows[0]?.exists) return [`${name}: the table doesn't exist`];

  const problems: string[] = [];

  const primaryKey = await pool.query<{ condeferrable: boolean }>(
    "SELECT condeferrable FROM pg_constraint WHERE conrelid = $1::regclass AND contype = 'p'",
    [relation],
  );
  const key = primaryKey.rows[0];
  if (!key) problems.push(`${name}: there is no primary key`);
  else if (key.condeferrable) problems.push(`${name}: the primary key is deferrable`);

  const identity = await pool.query<{ relreplident: string }>(
    "SELECT relreplident FROM pg_class WHERE oid = $1::regclass",
    [relation],
  );
  const replicaIdentity = identity.rows[0]?.relreplident ?? "";
  if (replicaIdentity !== "f") {
    const label = REPLICA_IDENTITIES[replicaIdentity] ?? replicaIdentity;
    problems.push(`${name}: the replica identity is ${label}, not FULL`);
  }

  const generated = await pool.query<{ attname: string }>(
    "SELECT attname FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated <> ''",
    [relation],
  );
  if (generated.rows.length > 0) {
    const list = generated.rows.map((row) => row.attname).join(", ");
    problems.push(`${name}: these columns are generated: ${list}`);
  }

  if (selectedColumns.length > 0) {
    const columns = await pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2",
      [SCHEMA, name],
    );
    const existing = new Set(columns.rows.map((row) => row.column_name));
    const missing = selectedColumns.filter((column) => !existing.has(column));
    if (missing.length > 0) {
      problems.push(`${name}: these selected columns are missing: ${missing.join(", ")}`);
    }
  }

  return problems;
}

// Collects every problem before failing, so that one run shows them all.
async function checkSyncedTables(): Promise<number> {
  const problems: string[] = [];
  for (const name of SYNCED_DOMAIN_TABLE_NAMES) {
    // drizzle-kit push has just created these columns from the schema.
    problems.push(...(await tableProblems(name, [])));
  }
  for (const name of SYNCED_MASTRA_TABLE_NAMES) {
    const selected = [...columnNames(MASTRA_TABLES[name]), ...(SQL_COLUMNS[name] ?? [])];
    problems.push(...(await tableProblems(name, selected)));
  }

  if (problems.length > 0) {
    throw new Error([
      "Some synced tables don't meet Neon Realtime's requirements:",
      ...problems.map((problem) => `  - ${problem}`),
      "A Mastra upgrade may have changed its tables.",
    ].join("\n"));
  }
  return SYNCED_DOMAIN_TABLE_NAMES.length + SYNCED_MASTRA_TABLE_NAMES.length;
}

async function seedDemoWorkspace(): Promise<void> {
  // Every browser shares this workspace and user until authentication lands.
  // There are no seeded leads: the demo starts empty.
  await db
    .insert(workspaces)
    .values({ id: DEMO_WORKSPACE_ID, name: DEMO_WORKSPACE_NAME })
    .onConflictDoNothing();
  await db
    .insert(users)
    .values({
      id: DEMO_USER_ID,
      workspaceId: DEMO_WORKSPACE_ID,
      name: DEMO_USER_NAME,
      email: DEMO_USER_EMAIL,
    })
    .onConflictDoNothing();
}

try {
  await initMastraStorage();
  console.log("Mastra storage is initialized.");

  const identityCount = await setReplicaIdentityFull();
  console.log(`Replica identity is FULL on ${identityCount} tables.`);

  const inlineCount = await keepSyncedValuesInline();
  console.log(`New values stay inline on ${inlineCount} synced tables (a temporary Neon Realtime workaround).`);

  const checkedCount = await checkSyncedTables();
  console.log(`All ${checkedCount} synced tables meet Neon Realtime's requirements.`);

  await seedDemoWorkspace();
  console.log("The demo workspace and user are seeded.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
