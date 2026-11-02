import { Client } from "pg";
import { postgresUrl } from "../src/connection.ts";

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url)
  throw new Error("DATABASE_URL_UNPOOLED is required for index refresh");

const client = new Client({
  connectionString: postgresUrl(url),
  connectionTimeoutMillis: 30_000,
});
try {
  await client.connect();
  // Refresh BM25-ranked full-text search statistics outside a transaction.
  await client.query("VACUUM ANALYZE public.search_chunks");
  console.log(
    "Refreshed BM25-ranked full-text search and planner statistics for search_chunks",
  );
} finally {
  await client.end();
}
