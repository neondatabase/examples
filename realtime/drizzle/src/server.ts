import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { connectionString } from "./connection-string.js";
import { createRealtime } from "@neon/realtime/server";
import { drizzleAdapter } from "@neon/realtime-drizzle";

import type { CreateTodoRequest, UpdateTodoRequest } from "./api-types.js";
import { todos } from "./schema.js";

const databaseUrl = required("DATABASE_URL");
const pool = new Pool({ connectionString: connectionString(databaseUrl) });
const db = drizzle(pool);
const realtime = createRealtime({
  secret: required("NEON_REALTIME_SECRET"),
  db: decodeURIComponent(new URL(databaseUrl).pathname.slice(1)),
  adapter: drizzleAdapter(),
});

const allTodos = () =>
  db
    .select({ id: todos.id, title: todos.title, status: todos.status })
    .from(todos);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/api/todos/live") {
      const query = await realtime.seal({ query: allTodos() });
      return json(response, 200, query);
    }

    if (request.method === "POST" && url.pathname === "/api/todos") {
      const { title } = await body<CreateTodoRequest>(request);
      const normalizedTitle = typeof title === "string" ? title.trim() : "";
      if (!normalizedTitle)
        return json(response, 400, { error: "Title is required" });
      const [todo] = await db
        .insert(todos)
        .values({ title: normalizedTitle, status: "active" })
        .returning();
      return json(response, 201, todo);
    }

    const match = url.pathname.match(/^\/api\/todos\/(\d+)$/);
    if (match && request.method === "PATCH") {
      const id = Number(match[1]);
      const { status } = await body<UpdateTodoRequest>(request);
      if (status !== "active" && status !== "completed") {
        return json(response, 400, { error: "Invalid status" });
      }
      await db.update(todos).set({ status }).where(eq(todos.id, id));
      return empty(response, 204);
    }

    if (match && request.method === "DELETE") {
      await db.delete(todos).where(eq(todos.id, Number(match[1])));
      return empty(response, 204);
    }

    if (
      process.env.NODE_ENV === "production" &&
      request.method === "GET" &&
      !url.pathname.startsWith("/api/")
    ) {
      return await serveFrontend(response, url.pathname);
    }
    json(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    json(response, 500, { error: "Internal server error" });
  }
});

const port = Number(process.env.PORT ?? 3001);
const host = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
server.listen(port, host, () => {
  console.log(`Todo app listening on http://${host}:${port}`);
});

async function serveFrontend(
  response: ServerResponse,
  pathname: string,
): Promise<void> {
  const directory = fileURLToPath(new URL("../dist/", import.meta.url));
  const filename = resolve(
    directory,
    pathname === "/" ? "index.html" : `.${decodeURIComponent(pathname)}`,
  );
  if (
    !filename.startsWith(directory.endsWith(sep) ? directory : directory + sep)
  ) {
    return json(response, 404, { error: "Not found" });
  }
  const contentTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
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

async function body<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function empty(response: ServerResponse, status: number): void {
  response.writeHead(status);
  response.end();
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => void pool.end().finally(() => process.exit()));
  });
}
