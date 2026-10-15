// Runs the Hono API and the Vite dev server in one process
import "./load-env";

import { createServer } from "vite";

// tsx doesn't set NODE_ENV, and debugMode in backend/realtime.ts reads it at load
process.env.NODE_ENV ??= "development";

await import("./server");

const vite = await createServer();
await vite.listen();
vite.printUrls();
