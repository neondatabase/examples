import { defineConfig } from 'drizzle-kit'

const url = process.env.NODE_ENV === 'production' ? process.env.POSTGRES_URL : process.env.LOCAL_POSTGRES_URL
if (!url) throw new Error(`Connection string to ${process.env.NODE_ENV ? 'Neon' : 'local'} Postgres not found.`)

export default defineConfig({
   dialect: 'postgresql',
   dbCredentials: { url },
   schema: './lib/schema.ts',
})
