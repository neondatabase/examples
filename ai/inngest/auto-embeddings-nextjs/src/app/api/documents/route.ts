import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: Request) {
  try {
    const { title, content } = await request.json();

    if (!title || !content) {
      return NextResponse.json(
        { error: "Title and content are required" },
        { status: 400 }
      );
    }

    // Insert document into database
    const records = await sql`
      INSERT INTO documents (title, content)
      VALUES (${title}, ${content})
      RETURNING id, title, content
    `;

    const document = records[0];

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        title: document.title,
        content: document.content,
      },
    });
  } catch (error) {
    console.error("Error creating document:", error);
    return NextResponse.json(
      { error: "Failed to create document" },
      { status: 500 }
    );
  }
}
