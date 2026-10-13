import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { from as copyFrom } from "pg-copy-streams";
import type { PoolClient } from "pg";

export type EmbeddedChunk = {
  chunkIndex: number;
  heading: string;
  content: string;
  embedding: number[];
};

// Binary COPY uses network byte order; vector receives int16 dimensions,
// int16 reserved, then float32 components. Serial and generated columns are omitted.
export function* binaryChunkRows(
  documentId: string,
  chunks: readonly EmbeddedChunk[],
): Generator<Buffer> {
  const header = Buffer.alloc(19);
  Buffer.from("PGCOPY\n\xff\r\n\0", "latin1").copy(header);
  yield header;
  for (const chunk of chunks) {
    if (
      chunk.embedding.length !== 1024 ||
      chunk.embedding.some(
        (value) =>
          !Number.isFinite(value) || !Number.isFinite(Math.fround(value)),
      )
    ) {
      throw new Error("Invalid 1024-dimensional vector");
    }
    const position = Buffer.alloc(4);
    position.writeInt32BE(chunk.chunkIndex);
    const vector = Buffer.alloc(4 + 4 * chunk.embedding.length);
    vector.writeInt16BE(chunk.embedding.length, 0);
    chunk.embedding.forEach((value, index) =>
      vector.writeFloatBE(value, 4 + index * 4),
    );
    const fields = [
      Buffer.from(documentId, "utf8"),
      position,
      Buffer.from(chunk.heading, "utf8"),
      Buffer.from(chunk.content, "utf8"),
      vector,
    ];
    const row = Buffer.alloc(
      2 + fields.reduce((size, field) => size + 4 + field.length, 0),
    );
    row.writeInt16BE(fields.length, 0);
    let offset = 2;
    for (const field of fields) {
      row.writeInt32BE(field.length, offset);
      field.copy(row, offset + 4);
      offset += 4 + field.length;
    }
    yield row;
  }
  const trailer = Buffer.alloc(2);
  trailer.writeInt16BE(-1);
  yield trailer;
}

export async function copyChunks(
  client: Pick<PoolClient, "query">,
  documentId: string,
  chunks: readonly EmbeddedChunk[],
): Promise<void> {
  if (!chunks.length) return;
  const destination = client.query(
    copyFrom(
      "COPY search_chunks (document_id, chunk_index, heading, content, embedding) FROM STDIN WITH (FORMAT binary)",
    ),
  );
  await pipeline(
    Readable.from(binaryChunkRows(documentId, chunks)),
    destination,
  );
}
