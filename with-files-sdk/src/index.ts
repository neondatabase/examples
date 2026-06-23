import { config as loadEnv } from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Files } from 'files-sdk';
import { neon } from 'files-sdk/neon';

// The Neon S3 credentials (AWS_* + the endpoint) are written to .env.local by
// `neon deploy` / `neon env pull`; the neon adapter reads them from the env.
loadEnv({ path: '.env.local' });

const BUCKET = 'assets';

const CONTENT_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

const assetsDir = fileURLToPath(new URL('../assets', import.meta.url));

// One adapter, one bucket — swap `neon(...)` for `s3(...)`, `r2(...)`, … and the
// rest of this script is unchanged. The adapter resolves its endpoint, region,
// and credentials from the injected AWS_* env vars.
const files = new Files({ adapter: neon({ bucket: BUCKET }) });

const entries = await readdir(assetsDir, { withFileTypes: true });
const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

if (fileNames.length === 0) {
  console.error(`No files found in ${assetsDir}`);
  process.exit(1);
}

console.log(`Uploading ${fileNames.length} file(s) to neon://${BUCKET}\n`);

for (const name of fileNames) {
  const body = await readFile(join(assetsDir, name));
  const contentType = CONTENT_TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream';
  const key = `logos/${name}`;

  const result = await files.upload(key, body, { contentType });
  const url = await files.url(key, { expiresIn: 3600 });

  console.log(`[upload] ${key} (${result.size} bytes, ${result.contentType})`);
  console.log(`[view]   ${url}\n`);
}

console.log(`Objects in neon://${BUCKET}/logos:`);
const { items } = await files.list({ prefix: 'logos/' });
for (const item of items) {
  console.log(`  ${item.key} — ${item.size} bytes`);
}
