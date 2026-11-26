import { Hono } from 'hono';
import { trpcServer } from '@hono/trpc-server';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseEnv } from '@neon/env';
import { attachDatabasePool } from '@neon/functions';
import config from '../neon';
import { appRouter } from './router';

const { postgres } = parseEnv(config, ['DATABASE_URL']);
const pool = new Pool({ connectionString: postgres.databaseUrl, max: 5 });
attachDatabasePool(pool);
const db = drizzle(pool);

const app = new Hono();

app.get('/', (c) => c.text('Neon tRPC API. Procedures: list, byId, create, delete at /trpc/*'));

app.use('/trpc/*', trpcServer({ router: appRouter, createContext: () => ({ db }) }));

export default app;
export type { AppRouter } from './router';
