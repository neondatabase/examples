import OpenAI from "openai";
import { validateVector } from "./input.ts";

export function createEmbedder() {
  const token = process.env.NEON_AI_GATEWAY_TOKEN;
  const baseURL = process.env.NEON_AI_GATEWAY_BASE_URL;
  if (!token || !baseURL) {
    throw new Error("Neon AI Gateway credentials are required");
  }
  const gateway = new OpenAI({ apiKey: token, baseURL: `${baseURL}/v1` });
  async function embed(
    text: string,
    kind?: "document" | "query",
  ): Promise<number[]>;
  async function embed(
    text: string[],
    kind?: "document" | "query",
  ): Promise<number[][]>;
  async function embed(
    text: string | string[],
    kind: "document" | "query" = "document",
  ) {
    const inputs = typeof text === "string" ? [text] : text;
    const formatted = inputs.map((value) =>
      kind === "query"
        ? `Instruct: Given a search query, retrieve relevant documents that answer the query\nQuery: ${value}`
        : value,
    );
    const response = await gateway.embeddings.create({
      model: "qwen3-embedding-0-6b",
      input: typeof text === "string" ? formatted[0]! : formatted,
      encoding_format: "float",
    });
    const vectors = new Map<number, number[]>();
    for (const item of response.data) {
      if (
        !Number.isInteger(item.index) ||
        item.index < 0 ||
        item.index >= inputs.length ||
        vectors.has(item.index)
      ) {
        throw new Error("Gateway returned invalid embedding indexes");
      }
      vectors.set(item.index, validateVector(item.embedding));
    }
    const ordered = inputs.map((_, index) => {
      const vector = vectors.get(index);
      if (!vector) throw new Error("Gateway returned no embedding");
      return vector;
    });
    return typeof text === "string" ? ordered[0]! : ordered;
  }
  return embed;
}
