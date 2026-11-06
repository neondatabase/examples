import { defineConfig } from 'drizzle-kit'

// `npm run db:push` applies src/lib/schema.ts to the database named by
// DATABASE_URL. The pgvector extension must already exist (`npm run db:extensions`
// runs first in `npm run setup`), since the schema uses `vector(n)` columns.
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set (see .env)')

export default defineConfig({
  schema: './src/lib/schema.ts',
  dialect: 'postgresql',
  dbCredentials: { url },
})
