export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import db from '@/lib/drizzle.server'
import { usersTable } from '@/lib/schema'

export async function GET() {
  const startTime = Date.now()
  try {
    const users = await db.select().from(usersTable)
    const duration = Date.now() - startTime
    return Response.json({ users, duration })
  } catch (e) {
    console.error(e)
    const duration = Date.now() - startTime
    return Response.json({ users: [], duration })
  }
}
