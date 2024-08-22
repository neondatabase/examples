import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'

const pool = new Pool({ connectionString: process.env.POSTGRES_URL })

export default drizzle(pool)
