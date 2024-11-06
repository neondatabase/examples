import { neonConfig, Pool } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import { PrismaClient } from '@prisma/client'
import { WebSocket } from 'ws'

declare global {
  var prisma: PrismaClient | undefined
}

const connectionString = `${process.env.POSTGRES_PRISMA_URL}`

neonConfig.webSocketConstructor = WebSocket
neonConfig.poolQueryViaFetch = true

const pool = new Pool({ connectionString, max: 0 })
const adapter = new PrismaNeon(pool)
const prisma = global.prisma || new PrismaClient({ adapter })

if (process.env.NODE_ENV === 'development') global.prisma = prisma

export default prisma
