import 'dotenv/config';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { todos } from './db/schema';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const db = drizzle(pool);

const app = new Hono();

app.get('/', (c) => c.text('Neon + Hono + Drizzle'));

app.post('/todos', async (c) => {
  const { text: body } = await c.req.json<{ text: string }>();
  const [row] = await db.insert(todos).values({ text: body }).returning();
  return c.json(row, 201);
});

app.get('/todos', async (c) => {
  const rows = await db.select().from(todos);
  return c.json(rows);
});

export default app;