import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { parseEnv } from '@neon/env';
import neonConfig from './neon';

loadEnv({ path: '.env.local' });
const env = parseEnv(neonConfig);

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.postgres.databaseUrl,
  },
});
