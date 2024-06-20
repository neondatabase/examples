import { neon } from '@neondatabase/serverless'
import { PageServerLoad } from '@analogjs/router';

const sql = neon(import.meta.env.DATABASE_URL)

export const load = async ({}: PageServerLoad) => {
  const response = await sql("SELECT version()")
  return response[0]
};
