import "./load-env.js";

import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { extname, resolve, sep } from "node:path";

import { createRealtime } from "@neon/realtime/server";
import { kyselyAdapter } from "@neon/realtime-kysely";
import { Kysely, PostgresDialect, sql } from "kysely";

import type {
  CreateTodoResponse,
  LiveTodosResponse,
  MutationResponse,
} from "./api-types.js";
import { pool } from "./db.js";
import { env, postgresDatabaseName } from "./env.js";
import type { Database } from "./schema.js";

const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

const realtime = createRealtime({
  secret: env.realtime.secret,
  db: postgresDatabaseName,
  adapter: kyselyAdapter(), // seals Kysely query builders, not raw SQL
});

// Same statement on every mutation: the client waits for this txid over Realtime before dropping
// its optimistic state, so the write must keep returning it.
const txid = sql<string>`pg_current_xact_id()::text`.as("txid");

// The only place the live query is built, so the sealed query matches the rows the server reads.
const selectTodos = () =>
  db
    .selectFrom("realtime_todos")
    .select(["id", "title", "completed"])
    .orderBy("id");

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/api/todos/live") {
      const query = await realtime.seal({ query: selectTodos() });
      return json(response, 200, {
        query,
        websocketUrl: env.realtime.url,
      } satisfies LiveTodosResponse);
    }

    if (request.method === "POST" && url.pathname === "/api/todos") {
      const input = await body(request);
      const title =
        typeof input === "object" &&
        input !== null &&
        "title" in input &&
        typeof input.title === "string"
          ? input.title.trim()
          : "";
      if (!title) return json(response, 400, { error: "Title is required" });
      if (title.length > 200) {
        return json(response, 400, { error: "Title is too long" });
      }

      const todo = await db
        .insertInto("realtime_todos")
        .values({ title })
        .returning(["id", txid])
        .executeTakeFirst();
      if (!todo) throw new Error("Postgres did not return the new todo");
      return json(response, 201, todo satisfies CreateTodoResponse);
    }

    const match = url.pathname.match(/^\/api\/todos\/(\d+)$/);
    if (match && request.method === "PATCH") {
      const result = await db
        .updateTable("realtime_todos")
        .set({ completed: sql<boolean>`NOT completed` })
        .where("id", "=", Number(match[1]))
        .returning(txid)
        .executeTakeFirst();
      return result
        ? json(response, 200, result satisfies MutationResponse)
        : json(response, 404, { error: "Todo not found" });
    }

    if (match && request.method === "DELETE") {
      const result = await db
        .deleteFrom("realtime_todos")
        .where("id", "=", Number(match[1]))
        .returning(txid)
        .executeTakeFirst();
      return result
        ? json(response, 200, result satisfies MutationResponse)
        : json(response, 404, { error: "Todo not found" });
    }

    if (
      process.env.NODE_ENV === "production" &&
      request.method === "GET" &&
      !url.pathname.startsWith("/api/")
    ) {
      return await serveFrontend(response, url.pathname);
    }
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return json(response, 500, { error: "Internal server error" });
  }
});

// Fail fast if the database is unreachable instead of accepting requests first.
await pool.query("SELECT 1");

const port = Number(process.env.PORT ?? 3001);
const host = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
server.listen(port, host, () => {
  console.log(`Todo app listening on http://${host}:${port}`);
});

async function serveFrontend(
  response: ServerResponse,
  pathname: string,
): Promise<void> {
  const directory = resolve("dist");
  const filename = resolve(
    directory,
    pathname === "/" ? "index.html" : `.${decodeURIComponent(pathname)}`,
  );
  if (
    !filename.startsWith(directory.endsWith(sep) ? directory : directory + sep)
  ) {
    return json(response, 404, { error: "Not found" });
  }

  const contentTypes: Readonly<Record<string, string>> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
  };
  try {
    const content = await readFile(filename);
    response.writeHead(200, {
      "content-type":
        contentTypes[extname(filename)] ?? "application/octet-stream",
    });
    response.end(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    json(response, 404, { error: "Not found" });
  }
}

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => void pool.end().finally(() => process.exit()));
  });
}
