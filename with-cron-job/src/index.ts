import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "./db/client.js";
import { counters } from "./db/schema.js";

const db = getDb();
const COUNTER_ID = 1;

// The Functions proxy drops client-supplied x-neon-* headers, so a present
// value is from a trigger delivery. It must match body.invocation_id.
const NEON_TRIGGER_INVOCATION_ID_HEADER = "x-neon-trigger-invocation-id";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseScheduleInvocation(body: unknown):
  | { invocationId: string; triggerName: string; scheduledAt: string }
  | undefined {
  if (!isRecord(body) || body.version !== 1) return undefined;

  const invocationId = body.invocation_id;
  if (typeof invocationId !== "string" || invocationId === "") return undefined;

  if (!isRecord(body.trigger) || body.trigger.type !== "schedule") {
    return undefined;
  }
  const triggerName = body.trigger.name;
  if (typeof triggerName !== "string" || triggerName === "") return undefined;

  if (!isRecord(body.data)) return undefined;
  const scheduledAt = body.data.scheduled_at;
  if (typeof scheduledAt !== "string" || scheduledAt === "") return undefined;

  return { invocationId, triggerName, scheduledAt };
}

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
  const headerId = c.req.header(NEON_TRIGGER_INVOCATION_ID_HEADER)?.trim();
  if (!headerId) {
    return c.text(`Missing ${NEON_TRIGGER_INVOCATION_ID_HEADER} header`, 401);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.text("Invalid JSON body", 400);
  }

  const parsed = parseScheduleInvocation(body);
  if (!parsed) {
    return c.text("Invalid cron payload", 400);
  }
  if (parsed.invocationId !== headerId) {
    return c.text("Invocation id mismatch", 401);
  }

  const value = await incrementCount();
  console.info("[cron]", {
    invocationId: parsed.invocationId,
    triggerName: parsed.triggerName,
    scheduledAt: parsed.scheduledAt,
    value,
  });
  return c.json({ value, invocationId: parsed.invocationId });
});

export default app;
