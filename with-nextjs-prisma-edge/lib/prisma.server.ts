import { neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import { PrismaClient } from '@prisma/client'
import { WebSocket } from 'ws'

declare global {
  var prisma: PrismaClient | undefined
}

const connectionString = `${process.env.POSTGRES_PRISMA_URL}`

neonConfig.webSocketConstructor = WebSocket
neonConfig.poolQueryViaFetch = true

const adapter = new PrismaNeon({ connectionString })
const prisma = global.prisma || new PrismaClient({ adapter })

if (process.env.NODE_ENV === 'development') global.prisma = prisma

export default prisma
