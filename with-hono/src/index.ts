import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseEnv } from '@neon/env';
import { attachDatabasePool } from '@neon/functions';
import config from '../neon';
import { todos } from './db/schema';

const { postgres } = parseEnv(config, ['DATABASE_URL']);
const pool = new Pool({ connectionString: postgres.databaseUrl, max: 5 });
attachDatabasePool(pool);
const db = drizzle(pool);

const app = new Hono();

app.get('/', (c) => c.text('Neon + Hono + Drizzle. GET /todos, POST /todos'));

app.get('/todos', async (c) => {
  return c.json(await db.select().from(todos));
});

app.post('/todos', async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  const [todo] = await db.insert(todos).values({ text }).returning();
  return c.json(todo, 201);
});

export default app;
