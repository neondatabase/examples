import { neonConfig, Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { WebSocket } from 'ws'

neonConfig.webSocketConstructor = WebSocket
neonConfig.poolQueryViaFetch = true

const pool = new Pool({ connectionString: process.env.POSTGRES_URL })

export default drizzle(pool)
