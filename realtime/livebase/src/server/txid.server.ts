import { sql } from "drizzle-orm";

import type { Tx } from "./db.server";

// Mutations return their transaction ID so that the browser can wait, with
// `collection.utils.awaitTxId(txid)`, until the write arrives on the live
// stream before it drops the optimistic row. Call it inside the transaction.
export async function transactionId(tx: Tx): Promise<{ txid: string }> {
  const result = await tx.execute<{ txid: string }>(
    sql`SELECT pg_current_xact_id()::text AS txid`,
  );
  return { txid: result.rows[0]!.txid };
}
