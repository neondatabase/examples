import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { Hono } from 'hono';
import { WebSocketServer, type WebSocket } from 'ws';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, Client } from 'pg';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { parseEnv } from '@neon/env';
import config from '../neon';
import { messages } from './db/schema';

const env = parseEnv(config);

const pool = new Pool({ connectionString: env.postgres.databaseUrl, max: 5 });
const db = drizzle(pool);

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

// Sockets connected to THIS isolate. Several isolates can run under load, so we
// fan messages out across all of them with Postgres LISTEN/NOTIFY rather than
// only broadcasting in-process.
const clients = new Set<WebSocket>();
const CHANNEL = 'chat_messages';

const listener = new Client({ connectionString: env.postgres.databaseUrlUnpooled });
listener
  .connect()
  .then(() => listener.query(`LISTEN ${CHANNEL}`))
  .catch((error) => console.error('[listen] failed:', error));
listener.on('notification', (msg) => {
  if (!msg.payload) return;
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg.payload);
  }
});

const wss = new WebSocketServer({ noServer: true });

const app = new Hono();
app.get('/', (c) => c.text('Neon realtime chat — connect over WebSocket with ?token=<jwt>'));

export default {
  fetch: (request: Request) => app.fetch(request),

  async upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const identity = await verifyToken(url.searchParams.get('token'));
    if (!identity) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      ws.on('close', () => clients.delete(ws));
      ws.on('message', async (data) => {
        const body = data.toString().slice(0, 2000).trim();
        if (!body) return;
        const [row] = await db
          .insert(messages)
          .values({ userId: identity.id, userName: identity.name, body })
          .returning();
        // NOTIFY fans the new row out to every isolate, which broadcasts to its
        // own connected clients (including the sender).
        await pool.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify(row)]);
      });
    });
  },
};
