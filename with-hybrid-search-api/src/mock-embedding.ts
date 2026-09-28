import { createHash } from "node:crypto";

export type EmbeddingProvider = "gateway" | "mock";

export function embeddingProvider(
  value: string | undefined,
): EmbeddingProvider {
  if (value === undefined || value === "gateway") return "gateway";
  if (value === "mock") return "mock";
  throw new Error("EMBEDDING_PROVIDER must be gateway or mock");
}

// Stable random-looking vectors exercise vector storage and SQL, but carry no meaning.
export function mockEmbedding(text: string): number[] {
  const digest = createHash("sha256").update(text).digest();
  let state = digest.readUInt32LE(0) || 1;
  return Array.from({ length: 1024 }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0x100000000) * 2 - 1;
  });
}
