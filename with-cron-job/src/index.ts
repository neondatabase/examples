import { parseTrigger } from "@neon/functions/hono";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "./db/client.js";
import { counters } from "./db/schema.js";

const db = getDb();
const COUNTER_ID = 1;

async function readCount(): Promise<number> {
  const [row] = await db
    .select({ value: counters.value })
    .from(counters)
    .where(eq(counters.id, COUNTER_ID));
  return row?.value ?? 0;
}

async function incrementCount(): Promise<number> {
  const [row] = await db
    .insert(counters)
    .values({ id: COUNTER_ID, value: 1 })
    .onConflictDoUpdate({
      target: counters.id,
      set: { value: sql`${counters.value} + 1` },
    })
    .returning({ value: counters.value });
  if (!row) {
    throw new Error("counter upsert returned no row");
  }
  return row.value;
}

const app = new Hono();

app.get("/", (c) => c.text("Neon cron counter. GET /counter, POST /cron"));

app.get("/counter", async (c) => c.json({ value: await readCount() }));

app.post("/cron", async (c) => {
  const invocation = await parseTrigger(c);
  const value = await incrementCount();
  console.info("[cron]", {
    invocationId: invocation.invocationId,
    triggerName: invocation.trigger.name,
    scheduledAt: invocation.data.scheduledAt,
    value,
  });
  return c.json({ value, invocationId: invocation.invocationId });
});

export default app;
