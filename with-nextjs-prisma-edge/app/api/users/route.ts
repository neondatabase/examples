export const runtime = 'edge'

export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import prisma from '@/lib/prisma.server'

export async function GET() {
  const startTime = Date.now()
  const users = await prisma.users.findMany()
  await prisma.$disconnect()
  const duration = Date.now() - startTime
  return Response.json({ users, duration })
}
