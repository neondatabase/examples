import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import { Pool, Client } from 'pg';
import { parseEnv } from '@neondatabase/env';
import config from '../neon';
import { counters } from './db/schema';

const env = parseEnv(config);

// The browser talks to this function directly (cross-origin), so allow the
// SPA's origin. Defaults to "*" for the demo; set WEB_ORIGIN to lock it down.
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? '*';

const pool = new Pool({ connectionString: env.postgres.databaseUrl, max: 5 });
const db = drizzle(pool);

const COUNTER_ID = 1;
const CHANNEL = 'counter_updates';

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

// SSE connections held open by THIS isolate. Under load the runtime runs
// several isolates in parallel, each with its own copy of this set — which is
// exactly why we fan out with Postgres LISTEN/NOTIFY below instead of only
// broadcasting in-process.
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

// One dedicated DIRECT connection per isolate, just to receive events. LISTEN
// needs a real session, so use DATABASE_URL_UNPOOLED, not the pooled URL.
const listener = new Client({ connectionString: env.postgres.databaseUrlUnpooled });
listener
  .connect()
  .then(() => listener.query(`LISTEN ${CHANNEL}`))
  .catch((error) => console.error('[listen] failed:', error));
listener.on('notification', (msg) => {
  if (!msg.payload) return;
  const value = Number(msg.payload);
  if (Number.isFinite(value)) broadcast(value);
});

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
  // NOTIFY fans the new value out to every isolate, each of which pushes it to
  // its own SSE clients (including whoever triggered the increment).
  await pool.query('SELECT pg_notify($1, $2)', [CHANNEL, String(value)]);
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
