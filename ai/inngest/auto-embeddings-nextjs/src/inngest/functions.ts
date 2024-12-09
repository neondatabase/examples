import { inngest } from "./client";
import { OpenAI } from "openai";
import { neon } from "@neondatabase/serverless";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const sql = neon(process.env.DATABASE_URL!);

export const generateEmbedding = inngest.createFunction(
  { id: "generate-document-embedding" },
  { event: "db/documents.inserted" },
  async ({ event, step }) => {
    const { id, title, content } = event.data.new;

    // Generate embedding using OpenAI
    const embedding = await step.run("Generate embedding", async () => {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: `${title}\n\n${content}`,
        dimensions: 512,
      });
      return response.data[0].embedding;
    });

    // Store embedding in Neon
    await step.run("Store embedding", async () => {
      await sql`
        UPDATE documents 
        SET 
          embedding = ${JSON.stringify(embedding)}::vector,
          processed_at = NOW()
        WHERE id = ${id}
      `;
    });

    return { id, status: "embedding_generated" };
  }
);
