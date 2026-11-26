import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { parseEnv } from '@neon/env';
import { attachDatabasePool } from '@neon/functions';
import { parseTrigger } from '@neon/functions/hono';
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

const app = new Hono();

app.get('/', (c) => c.text('Neon cron counter. GET /counter, POST /cron'));

app.get('/counter', async (c) => c.json({ value: await readCount() }));

app.post('/cron', async (c) => {
  const { invocationId, trigger } = await parseTrigger(c);
  const value = await incrementCount();
  console.info(`[cron] ${trigger.name} ran, counter is ${value}`);
  return c.json({ value, invocationId });
});

export default app;
