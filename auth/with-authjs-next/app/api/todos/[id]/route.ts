import { auth } from '@/auth'
import { Pool } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const { rows } = await pool.query('UPDATE todos SET completed = NOT completed WHERE id = $1 AND user_id = $2 RETURNING *', [params.id, session.user.id])
    if (rows.length === 0) return NextResponse.json({ error: 'Todo not found' }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update todo' }, { status: 500 })
  } finally {
    await pool.end()
  }
}
