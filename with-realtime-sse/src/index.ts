import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { eq, sql } from 'drizzle-orm';
import { getDb } from './db/client';
import { counters } from './db/schema';

// The browser talks to this function directly (cross-origin), so allow the
// SPA's origin. Defaults to "*" for the demo; set WEB_ORIGIN to lock it down.
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? '*';

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
  return row.value;
}

// SSE connections held open by THIS isolate. Under load the runtime runs several
// isolates in parallel, each with its own copy of this set. Postgres is the
// shared source of truth: every isolate polls it (below) and pushes changes to
// its own clients, so all isolates converge without any cross-isolate messaging.
const encoder = new TextEncoder();
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

// Sent as the default ("message") SSE event so the client can read it with a
// plain `EventSource.onmessage` handler.
function countFrame(value: number): Uint8Array {
  return encoder.encode(`data: ${value}\n\n`);
}

function broadcast(value: number) {
  const frame = countFrame(value);
  for (const controller of clients) {
    try {
      controller.enqueue(frame);
    } catch {
      clients.delete(controller);
    }
  }
}

// Fan-out by polling Postgres. One read per isolate per tick (not per client),
// and none at all while this isolate has no clients — so an idle compute can
// still scale to zero. This trades a little latency (up to the interval) for a
// model that works across isolates and holds no unpooled LISTEN connection open.
// See "Real-time considerations" in the README for the alternatives.
let lastPushed: number | null = null;
async function poll() {
  if (clients.size === 0) return;
  const value = await readCount();
  if (value !== lastPushed) {
    lastPushed = value;
    broadcast(value);
  }
}
const poller = setInterval(() => {
  poll().catch((error) => console.error('[poll] failed:', error));
}, 1000);
poller.unref?.();

// Keep otherwise-silent streams alive: SSE connections only stay open while
// bytes flow (Neon's heartbeat window is 15 minutes; proxies are often
// stricter). A comment line every 25s is ignored by EventSource but resets the
// idle timers.
const heartbeat = setInterval(() => {
  const ping = encoder.encode(`: ping\n\n`);
  for (const controller of clients) {
    try {
      controller.enqueue(ping);
    } catch {
      clients.delete(controller);
    }
  }
}, 25_000);
heartbeat.unref?.();

const app = new Hono();
app.use('*', cors({ origin: WEB_ORIGIN }));

app.get('/', (c) =>
  c.text('Neon realtime counter — GET /count, POST /increment, GET /events (SSE)'),
);

app.get('/count', async (c) => c.json({ value: await readCount() }));

app.post('/increment', async (c) => {
  const value = await incrementCount();
  // Every isolate's poll loop picks this new value up from Postgres and pushes
  // it to its own SSE clients (including whoever triggered the increment).
  return c.json({ value });
});

app.get('/events', async (c) => {
  const initial = await readCount();
  let self: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      self = controller;
      clients.add(controller);
      controller.enqueue(countFrame(initial));
    },
    cancel() {
      clients.delete(self);
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': WEB_ORIGIN,
    },
  });
});

export default app;
