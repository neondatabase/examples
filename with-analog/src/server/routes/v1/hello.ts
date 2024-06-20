import { defineEventHandler } from 'h3';
import { neon } from '@neondatabase/serverless'

const sql = neon(import.meta.env.DATABASE_URL)

export default defineEventHandler(async () => {
  const response = await sql("SELECT version()")
  return response[0]['version']
});
