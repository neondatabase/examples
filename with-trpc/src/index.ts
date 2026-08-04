import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { getDb } from "./db/client.js";
import { appRouter } from "./router.js";

const db = getDb();

const app = new Hono();

app.get("/", (c) =>
  c.json({
    ok: true,
    service: "trpc",
    endpoints: {
      trpc: "GET|POST /trpc/*",
      procedures: ["list", "byId", "create", "delete"],
    },
  }),
);

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: () => ({ db }),
  }),
);

export default app;
export type { AppRouter } from "./router.js";
