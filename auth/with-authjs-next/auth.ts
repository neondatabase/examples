import PostgresAdapter from '@auth/pg-adapter'
import { Pool } from '@neondatabase/serverless'
import NextAuth from 'next-auth'
import Resend from 'next-auth/providers/resend'

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  return {
    adapter: PostgresAdapter(pool),
    providers: [Resend({ from: 'Test <onboarding@resend.dev>' })],
  }
})
