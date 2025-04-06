import { neon } from "@neondatabase/serverless";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const { objectUrl } = await request.json();
  if (!process.env.DATABASE_URL) return new Response(null, { status: 500 });
  const sql = neon(process.env.DATABASE_URL);
  try {
    // Create the user table if it does not exist
    await sql`CREATE TABLE IF NOT EXISTS "user" (name TEXT, image TEXT)`;
    // Mock call to get the user
    const user = "rishi"; // getUser();
    // Insert the user name and the reference to the image into the user table
    await sql.query('INSERT INTO "user" (name, image) VALUES ($1, $2)', [
      user,
      objectUrl,
    ]);
    return NextResponse.json({ code: 1 });
  } catch (e) {
    return NextResponse.json({
      code: 0,
      message: e instanceof Error ? e.message : e?.toString(),
    });
  }
}
