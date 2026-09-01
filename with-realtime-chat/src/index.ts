import { Hono } from 'hono';
import { upgradeWebSocket } from '@neon/functions/hono';
import { desc, gt } from 'drizzle-orm';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { parseEnv } from '@neon/env';
import config from '../neon';
import { getDb } from './db/client';
import { messages } from './db/schema';

const env = parseEnv(config);
const db = getDb();

// Neon Auth signs tokens with the auth server's origin as the issuer.
const jwks = createRemoteJWKSet(new URL(env.auth.jwksUrl));
const issuer = new URL(env.auth.baseUrl).origin;

type Identity = { id: string; name: string };

type AppEnv = { Variables: { identity: Identity } };

async function verifyToken(token: string | null): Promise<Identity | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer });
    if (typeof payload.sub !== 'string') return null;
    const name =
      typeof payload.name === 'string'
        ? payload.name
        : typeof payload.email === 'string'
          ? payload.email
          : 'anon';
    return { id: payload.sub, name };
  } catch {
    return null;
  }
}

// Sockets connected to THIS isolate. Several isolates can run under load, each
// with its own sockets. Postgres is the shared source of truth: every isolate
// polls for new rows (below) and pushes them to its own clients, so the chat is
// shared across isolates without any cross-isolate messaging.
const clients = new Set<WebSocket>();

// Fan-out by polling Postgres. One query per isolate per tick, and none while
// this isolate has no clients — so an idle compute can still scale to zero.
// `lastId` starts unset and is seeded to the latest row id on the first tick, so
// we stream only NEW messages; clients load history separately over REST. See
// "Real-time considerations" in the README for the alternatives.
let lastId: number | null = null;
async function poll() {
  if (clients.size === 0) return;
  if (lastId === null) {
    const [latest] = await db
      .select({ id: messages.id })
      .from(messages)
      .orderBy(desc(messages.id))
      .limit(1);
    lastId = latest?.id ?? 0;
    return;
  }
  const rows = await db
    .select()
    .from(messages)
    .where(gt(messages.id, lastId))
    .orderBy(messages.id);
  for (const row of rows) {
    lastId = row.id;
    const payload = JSON.stringify(row);
    for (const socket of clients) {
      if (socket.readyState === socket.OPEN) socket.send(payload);
    }
  }
}
const poller = setInterval(() => {
  poll().catch((error) => console.error('[poll] failed:', error));
}, 1000);
poller.unref?.();

const app = new Hono<AppEnv>();

app.use('/', async (c, next) => {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') {
    await next();
    return;
  }
  const identity = await verifyToken(c.req.query('token') ?? null);
  if (!identity) return c.text('Unauthorized', 401);
  c.set('identity', identity);
  await next();
});

app.get(
  '/',
  upgradeWebSocket((c) => {
    const identity = c.get('identity');
    return {
      onOpen(_event, ws) {
        clients.add(ws.raw);
      },
      onClose(_event, ws) {
        clients.delete(ws.raw);
      },
      onMessage(event) {
        const body = String(event.data).slice(0, 2000).trim();
        if (!body) return;
        // Just persist it. Every isolate's poll loop (including this one) picks
        // the new row up from Postgres and fans it out to its own clients.
        void db.insert(messages).values({
          userId: identity.id,
          userName: identity.name,
          body,
        });
      },
    };
  }),
  (c) => c.text('Neon realtime chat — connect over WebSocket with ?token=<jwt>'),
);

export default app;
