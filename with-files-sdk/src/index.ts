import { config as loadEnv } from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Files } from 'files-sdk';
import { neon } from 'files-sdk/neon';

// The neon adapter reads the S3 credentials neon deploy / neon env pull wrote here.
loadEnv({ path: '.env.local' });

const BUCKET = 'assets';
const assetsDir = fileURLToPath(new URL('../assets', import.meta.url));

const files = new Files({ adapter: neon({ bucket: BUCKET }) });

const names = (await readdir(assetsDir)).filter((name) => name.endsWith('.png'));
console.log(`Uploading ${names.length} file(s) to neon://${BUCKET}\n`);

for (const name of names) {
  const body = await readFile(join(assetsDir, name));
  const key = `logos/${name}`;
  const { size } = await files.upload(key, body, { contentType: 'image/png' });
  const url = await files.url(key, { expiresIn: 3600 });
  console.log(`[upload] ${key} (${size} bytes)`);
  console.log(`[view]   ${url}\n`);
}

const { items } = await files.list({ prefix: 'logos/' });
console.log(`Objects in neon://${BUCKET}/logos:`);
for (const item of items) {
  console.log(`  ${item.key} — ${item.size} bytes`);
}
