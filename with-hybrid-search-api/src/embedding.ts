import { neon } from "@neon/ai-sdk-provider";
import { embed as embedOne, embedMany, wrapEmbeddingModel } from "ai";
import { validateVector } from "./input.ts";

export const EMBEDDING_MODEL = "qwen3-embedding-0-6b";
export const EMBEDDING_DIMENSIONS = 1024;
export const EMBEDDING_TIMEOUT_MS = 30_000;

export function createEmbedder() {
  if (
    !process.env.NEON_AI_GATEWAY_TOKEN ||
    !process.env.NEON_AI_GATEWAY_BASE_URL
  ) {
    throw new Error("Neon AI Gateway credentials are required");
  }
  const model = wrapEmbeddingModel({
    model: neon.embeddingModel(EMBEDDING_MODEL),
    middleware: {
      specificationVersion: "v4",
      wrapEmbed: async ({ doEmbed, params }) => {
        const result = await doEmbed();
        // The provider maps response order; retain the API's index-based check.
        const data = (
          result.response?.body as
            { data?: { index: number; embedding: number[] }[] } | undefined
        )?.data;
        if (!Array.isArray(data) || data.length !== params.values.length)
          throw new Error("Gateway returned no embedding for an input");
        const vectors = new Map<number, number[]>();
        for (const item of data) {
          if (
            !Number.isInteger(item.index) ||
            item.index < 0 ||
            item.index >= params.values.length ||
            vectors.has(item.index)
          )
            throw new Error("Gateway returned invalid embedding indexes");
          vectors.set(item.index, validateVector(item.embedding));
        }
        return {
          ...result,
          embeddings: params.values.map((_, index) => vectors.get(index)!),
        };
      },
    },
  });
  const providerOptions = { neon: { dimensions: EMBEDDING_DIMENSIONS } };
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
    const format = (value: string) =>
      kind === "query"
        ? `Instruct: Given a search query, retrieve relevant documents that answer the query\nQuery: ${value}`
        : value;
    // One deadline includes every batch and retry, rather than resetting per call.
    const abortSignal = AbortSignal.timeout(EMBEDDING_TIMEOUT_MS);
    const options = { model, providerOptions, maxRetries: 2, abortSignal };
    if (typeof text === "string") {
      const { embedding } = await embedOne({ ...options, value: format(text) });
      return validateVector(embedding);
    }
    const { embeddings } = await embedMany({
      ...options,
      values: text.map(format),
      maxParallelCalls: 1,
    });
    if (embeddings.length !== text.length)
      throw new Error("Gateway returned an incomplete embedding batch");
    return embeddings.map(validateVector);
  }
  return embed;
}
