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
  // VACUUM refreshes BM25 corpus statistics and must run outside a transaction.
  await client.query("VACUUM ANALYZE public.search_chunks");
  console.log("Refreshed search_chunks BM25 and planner statistics");
} finally {
  await client.end();
}
