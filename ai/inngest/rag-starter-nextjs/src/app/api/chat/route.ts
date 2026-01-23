import { OpenAI } from "openai";
import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: Request) {
  try {
    const { message } = await request.json();

    // Generate embedding for the message
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: message,
    });
    const embedding = response.data[0].embedding;

    // Find relevant documents
    const documents = await sql`
      SELECT 
        title,
        content,
        1 - (embedding <=> ${JSON.stringify(embedding)}::vector) as similarity
      FROM documents
      WHERE embedding IS NOT NULL
      ORDER BY similarity DESC
      LIMIT 3
    `;

    // Create context from relevant documents
    const context = documents
      .map(
        (doc) =>
          `Title: ${doc.title}\nContent: ${doc.content}\nRelevance: ${(
            doc.similarity * 100
          ).toFixed(2)}%`
      )
      .join("\n\n");

    // Generate chat response
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant. Answer questions based on the following context:\n\n${context}`,
        },
        { role: "user", content: message },
      ],
    });

    return NextResponse.json({ answer: completion.choices[0].message.content });
  } catch (error) {
    console.error("Error in chat:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}
