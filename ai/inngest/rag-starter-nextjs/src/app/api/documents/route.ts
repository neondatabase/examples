import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";

export async function POST(request: Request) {
  try {
    const { title, content } = await request.json();

    if (!title || !content) {
      return NextResponse.json(
        { error: "Title and content are required" },
        { status: 400 }
      );
    }

    // Send event to Inngest for background processing
    await inngest.send({
      name: "document/process",
      data: { title, content },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing document:", error);
    return NextResponse.json(
      { error: "Failed to process document" },
      { status: 500 }
    );
  }
}
