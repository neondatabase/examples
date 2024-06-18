import type { NextApiRequest, NextApiResponse } from "next";

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const response = await sql`SELECT version()`;
  res.status(200).json({
    message: response[0].version,
  });
}
