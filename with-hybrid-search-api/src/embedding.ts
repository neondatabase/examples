import OpenAI from "openai";
import { validateVector } from "./input.ts";

export function createEmbedder() {
  const token = process.env.NEON_AI_GATEWAY_TOKEN;
  const baseURL = process.env.NEON_AI_GATEWAY_BASE_URL;
  if (!token || !baseURL) {
    throw new Error("Neon AI Gateway credentials are required");
  }
  const gateway = new OpenAI({ apiKey: token, baseURL: `${baseURL}/v1` });
  return async (text: string, kind: "document" | "query" = "document") => {
    const response = await gateway.embeddings.create({
      model: "qwen3-embedding-0-6b",
      // Qwen queries carry a retrieval task; document text remains unprefixed.
      input:
        kind === "query"
          ? `Instruct: Given a search query, retrieve relevant documents that answer the query\nQuery: ${text}`
          : text,
      encoding_format: "float",
    });
    const vector = response.data.find((item) => item.index === 0)?.embedding;
    if (!vector) throw new Error("Gateway returned no embedding");
    return validateVector(vector);
  };
}
