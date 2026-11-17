import { chmod, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

// neon env pull owns the database credentials and server-only Realtime secret.
// This step only copies its public URL to the framework's browser variable.
const file = fileURLToPath(new URL("../.env.local", import.meta.url));
const existing = await readFile(file, "utf8");
const url = parseEnv(existing).NEON_REALTIME_URL;
if (!url || !/^wss?:\/\//.test(url)) {
  throw new Error("neon env pull must provide a WebSocket NEON_REALTIME_URL.");
}
const publicKey = "VITE_NEON_REALTIME_URL";
const lines = existing.split("\n").filter((line) => {
  const key = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z_0-9]*)\s*=/)?.[1];
  return key !== publicKey;
});
await writeFile(
  file,
  `${lines.join("\n").trimEnd()}\n${publicKey}=${JSON.stringify(url)}\n`,
  { mode: 0o600 },
);
await chmod(file, 0o600);
console.log(`${publicKey} now matches the URL pulled by the Neon CLI.`);
