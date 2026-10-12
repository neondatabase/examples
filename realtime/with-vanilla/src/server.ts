import "./load-env.js";

import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { extname, resolve, sep } from "node:path";

import { createRealtime, rawSql } from "@neon/realtime/server";

import type {
  CreateTodoResponse,
  LiveTodosResponse,
  MutationResponse,
} from "./api-types.js";
import { pool } from "./db.js";
import { env, postgresDatabaseName } from "./env.js";
import type { Todo } from "./schema.js";

const realtime = createRealtime({
  secret: env.realtime.secret,
  db: postgresDatabaseName,
});

const selectTodos = () =>
  rawSql<Todo>("select id, title, completed from realtime_todos order by id");

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

      const { rows } = await pool.query<CreateTodoResponse>(
        `insert into realtime_todos (title)
         values ($1)
         returning id, pg_current_xact_id()::text as txid`,
        [title],
      );
      const todo = rows[0];
      if (!todo) throw new Error("Postgres did not return the new todo");
      return json(response, 201, todo);
    }

    const match = url.pathname.match(/^\/api\/todos\/(\d+)$/);
    if (match && request.method === "PATCH") {
      const { rows } = await pool.query<MutationResponse>(
        `update realtime_todos
            set completed = not completed
          where id = $1
          returning pg_current_xact_id()::text as txid`,
        [Number(match[1])],
      );
      const result = rows[0];
      return result
        ? json(response, 200, result)
        : json(response, 404, { error: "Todo not found" });
    }

    if (match && request.method === "DELETE") {
      const { rows } = await pool.query<MutationResponse>(
        `delete from realtime_todos
          where id = $1
          returning pg_current_xact_id()::text as txid`,
        [Number(match[1])],
      );
      const result = rows[0];
      return result
        ? json(response, 200, result)
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

await pool.query("select 1");

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
