import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { parseEnv } from '@neon/env';
import { attachDatabasePool } from '@neon/functions';
import config from '../neon';
import { counters } from './db/schema';

const { postgres } = parseEnv(config, ['DATABASE_URL']);
const pool = new Pool({ connectionString: postgres.databaseUrl, max: 5 });
attachDatabasePool(pool);
const db = drizzle(pool);

const COUNTER_ID = 1;

async function readCount() {
  const [counter] = await db.select().from(counters).where(eq(counters.id, COUNTER_ID));
  return counter?.value ?? 0;
}

async function incrementCount() {
  const [counter] = await db
    .insert(counters)
    .values({ id: COUNTER_ID, value: 1 })
    .onConflictDoUpdate({ target: counters.id, set: { value: sql`${counters.value} + 1` } })
    .returning();
  return counter.value;
}

const encoder = new TextEncoder();

// Each isolate holds its own clients. Every isolate polls Postgres and pushes changes to
// its clients, so they stay in sync without LISTEN, and an idle compute can scale to zero.
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

function send(frame: string) {
  const bytes = encoder.encode(frame);
  for (const client of clients) {
    try {
      client.enqueue(bytes);
    } catch {
      clients.delete(client);
    }
  }
}

let lastSent: number | null = null;

setInterval(async () => {
  if (clients.size === 0) return;
  try {
    const value = await readCount();
    if (value === lastSent) return;
    lastSent = value;
    send(`data: ${value}\n\n`);
  } catch (error) {
    console.error('[poll] failed:', error);
  }
}, 1000).unref();

// Idle SSE connections are closed after 15 minutes without bytes; proxies are often stricter.
setInterval(() => send(': ping\n\n'), 25_000).unref();

const app = new Hono();

app.use('*', cors());

app.get('/', (c) => c.text('Neon SSE counter. GET /count, POST /increment, GET /events'));

app.get('/count', async (c) => c.json({ value: await readCount() }));

app.post('/increment', async (c) => c.json({ value: await incrementCount() }));

app.get('/events', async (c) => {
  const value = await readCount();
  let client: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      client = controller;
      clients.add(controller);
      controller.enqueue(encoder.encode(`data: ${value}\n\n`));
    },
    cancel() {
      clients.delete(client);
    },
  });
  return c.body(stream, 200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
});

export default app;
