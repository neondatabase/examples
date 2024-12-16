import { WebSocket } from 'ws'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { neonConfig, Pool } from '@neondatabase/serverless'

const connectionString = process.env.VERCEL_ENV === 'production' ? process.env.POSTGRES_URL : process.env.LOCAL_POSTGRES_URL
if (process.env.VERCEL_ENV === 'production') {
  neonConfig.poolQueryViaFetch = true
  neonConfig.webSocketConstructor = WebSocket
} else {
  neonConfig.pipelineTLS = false
  neonConfig.pipelineConnect = false
  neonConfig.useSecureWebSocket = false
  neonConfig.wsProxy = (host) => `${host}:4444/v1`
}

const pool = new Pool({ connectionString })

export default drizzle(pool)
