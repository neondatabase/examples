import { Hono } from 'hono';
import { upgradeWebSocket } from '@neon/functions';
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

const app = new Hono();
app.get('/', (c) => c.text('Neon realtime chat — connect over WebSocket with ?token=<jwt>'));

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return app.fetch(request);
    }

    const url = new URL(request.url);
    const identity = await verifyToken(url.searchParams.get('token'));
    if (!identity) return new Response('unauthorized', { status: 401 });

    const { socket, response } = upgradeWebSocket(request);

    clients.add(socket);
    socket.addEventListener('close', () => clients.delete(socket));
    socket.addEventListener('message', (event) => {
      const body = typeof event.data === 'string' ? event.data.slice(0, 2000).trim() : '';
      if (!body) return;
      // Just persist it. Every isolate's poll loop (including this one) picks
      // the new row up from Postgres and fans it out to its own clients.
      db.insert(messages)
        .values({ userId: identity.id, userName: identity.name, body })
        .catch((error) => console.error('[insert] failed:', error));
    });

    return response;
  },
};
