import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseEnv } from '@neon/env';
import { attachDatabasePool } from '@neon/functions';
import {
  isStorageObjectCreatedTriggerInvocation,
  parseTriggerDelivery,
} from '@neon/functions/hono';
import config from '../neon';
import { objects } from './db/schema';

const { postgres } = parseEnv(config, ['DATABASE_URL']);
const pool = new Pool({ connectionString: postgres.databaseUrl, max: 5 });
attachDatabasePool(pool);
const db = drizzle(pool);

const app = new Hono();

app.get('/', (c) => c.text('Neon object ingest. GET /files, POST /object'));

app.get('/files', async (c) => {
  const files = await db
    .select({ bucket: objects.bucket, objectKey: objects.objectKey })
    .from(objects);
  return c.json({ files });
});

app.post('/object', async (c) => {
  const delivery = await parseTriggerDelivery(c.req.raw);
  if (!delivery.ok) {
    return c.json({ error: delivery.error }, delivery.error === 'invalid_body' ? 400 : 401);
  }
  if (!isStorageObjectCreatedTriggerInvocation(delivery.invocation)) {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const { bucketName, objectKey } = delivery.invocation.data;
  await db.insert(objects).values({ bucket: bucketName, objectKey }).onConflictDoNothing();
  console.info(`[ingest] indexed ${bucketName}/${objectKey}`);
  return c.json({ bucket: bucketName, objectKey });
});

export default app;
