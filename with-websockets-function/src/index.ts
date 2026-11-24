import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { desc, gt } from 'drizzle-orm';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Pool } from 'pg';
import { parseEnv } from '@neon/env';
import { attachDatabasePool, waitUntil } from '@neon/functions';
import { upgradeWebSocket } from '@neon/functions/hono';
import config from '../neon';
import { messages } from './db/schema';

const env = parseEnv(config);
const pool = new Pool({ connectionString: env.postgres.databaseUrl, max: 5 });
attachDatabasePool(pool);
const db = drizzle(pool);

// Neon Auth signs tokens with the auth server's origin as the issuer.
const jwks = createRemoteJWKSet(new URL(env.auth.jwksUrl));
const issuer = new URL(env.auth.baseUrl).origin;

type User = { id: string; name: string };

async function verifyToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer });
    if (typeof payload.sub !== 'string') return null;
    const name = [payload.name, payload.email].find((value) => typeof value === 'string') ?? 'anon';
    return { id: payload.sub, name };
  } catch {
    return null;
  }
}

// Each isolate holds its own sockets. Every isolate polls Postgres for new messages and
// pushes them to its sockets, so the chat stays in sync without LISTEN, and an idle compute
// can scale to zero. Clients load history over REST; this streams only new messages.
const sockets = new Set<WebSocket>();
let lastId: number | null = null;

async function pushNewMessages() {
  if (sockets.size === 0) return;
  if (lastId === null) {
    const [latest] = await db
      .select({ id: messages.id })
      .from(messages)
      .orderBy(desc(messages.id))
      .limit(1);
    lastId = latest?.id ?? 0;
    return;
  }
  const rows = await db.select().from(messages).where(gt(messages.id, lastId)).orderBy(messages.id);
  for (const message of rows) {
    lastId = message.id;
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    }
  }
}

setInterval(() => {
  pushNewMessages().catch((error) => console.error('[poll] failed:', error));
}, 1000).unref();

const app = new Hono<{ Variables: { user: User } }>();

app.use('/', async (c, next) => {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') return next();
  const user = await verifyToken(c.req.query('token'));
  if (!user) return c.text('Unauthorized', 401);
  c.set('user', user);
  return next();
});

app.get(
  '/',
  upgradeWebSocket((c) => {
    const user = c.get('user');
    return {
      onOpen(_event, ws) {
        if (ws.raw) sockets.add(ws.raw);
      },
      onClose(_event, ws) {
        if (ws.raw) sockets.delete(ws.raw);
      },
      onMessage(event) {
        const body = String(event.data).slice(0, 2000).trim();
        if (!body) return;
        // waitUntil keeps the isolate alive until the insert settles.
        waitUntil(
          db.insert(messages).values({ userId: user.id, userName: user.name, body }).execute(),
        );
      },
    };
  }),
  (c) => c.text('Neon WebSocket chat. Connect over WebSocket with ?token=<jwt>'),
);

export default app;
