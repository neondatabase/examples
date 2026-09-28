import OpenAI from "openai";
import { validateVector } from "./input.js";
import { EmbeddingProvider, mockEmbedding } from "./mock-embedding.js";

export function createEmbedder(provider: EmbeddingProvider) {
  if (provider === "mock") {
    return async (text: string) => validateVector(mockEmbedding(text));
  }

  const token = process.env.NEON_AI_GATEWAY_TOKEN;
  const baseURL = process.env.NEON_AI_GATEWAY_BASE_URL;
  if (!token || !baseURL) {
    throw new Error("Neon AI Gateway credentials are required");
  }
  const gateway = new OpenAI({ apiKey: token, baseURL: `${baseURL}/v1` });
  return async (text: string) => {
    const response = await gateway.embeddings.create({
      model: "qwen3-embedding-0-6b",
      input: text,
      encoding_format: "float",
    });
    const vector = response.data.find((item) => item.index === 0)?.embedding;
    if (!vector) throw new Error("Gateway returned no embedding");
    return validateVector(vector);
  };
}
