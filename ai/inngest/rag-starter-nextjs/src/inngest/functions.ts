import { inngest } from "./client";
import { OpenAI } from "openai";
import { neon } from "@neondatabase/serverless";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const sql = neon(process.env.DATABASE_URL!);

export const processDocument = inngest.createFunction(
  { id: "process-document" },
  { event: "document/process" },
  async ({ event, step }) => {
    const { title, content } = event.data;

    // Generate embedding using OpenAI
    const embedding = await step.run("Generate embedding", async () => {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: `${title}\n\n${content}`,
      });
      return response.data[0].embedding;
    });

    // Store document with embedding
    await step.run("Store document", async () => {
      await sql`
        INSERT INTO documents (title, content, embedding)
        VALUES (${title}, ${content}, ${JSON.stringify(embedding)}::vector)
      `;
    });

    return { success: true };
  }
);
