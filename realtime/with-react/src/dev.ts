import "./load-env.js";

import { createServer } from "vite";

await import("./server.js");

const vite = await createServer();
await vite.listen();
vite.printUrls();
