import { Hono } from "hono";
import { env } from "hono/adapter";
import { handle } from "hono/vercel";
import { neon } from "@neondatabase/serverless";

export const config = {
  runtime: "edge",
};

const app = new Hono().basePath("/api");

app.get("/", async (c) => {
  const { DATABASE_URL } = env<{ DATABASE_URL: string }>(c);
  const sql = neon(DATABASE_URL);
  const result = await sql`SELECT version()`;
  const { version } = result[0];
  return c.json({ version });
});

export default handle(app);
