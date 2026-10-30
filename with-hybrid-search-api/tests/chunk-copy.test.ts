import assert from "node:assert/strict";
import test from "node:test";
import { Writable } from "node:stream";
import type { PoolClient } from "pg";
import { binaryChunkRows, copyChunks } from "../src/chunk-copy.ts";

const chunk = {
  chunkIndex: 3,
  heading: "α\n雪",
  content: "text\t\\with\nnewlines",
  embedding: Array.from({ length: 1024 }, (_, i) =>
    i === 0 ? 0.123456789 : -i,
  ),
};

test("binary COPY batches preserve UTF-8, int4 positions and float32 vectors", () => {
  const buffers = [
    ...binaryChunkRows("guide-1", [chunk, { ...chunk, chunkIndex: 4 }]),
  ];
  assert.equal(buffers.length, 4);
  assert.deepEqual(
    buffers[0],
    Buffer.concat([
      Buffer.from("PGCOPY\n\xff\r\n\0", "latin1"),
      Buffer.alloc(8),
    ]),
  );
  for (const [index, row] of buffers.slice(1, -1).entries()) {
    assert.equal(row.readInt16BE(0), 5);
    const fields: Buffer[] = [];
    let offset = 2;
    for (let i = 0; i < 5; i++) {
      const length = row.readInt32BE(offset);
      fields.push(row.subarray(offset + 4, offset + 4 + length));
      offset += 4 + length;
    }
    assert.equal(offset, row.length);
    assert.equal(fields[0]!.toString("utf8"), "guide-1");
    assert.equal(fields[1]!.readInt32BE(0), 3 + index);
    assert.equal(fields[2]!.toString("utf8"), chunk.heading);
    assert.equal(fields[3]!.toString("utf8"), chunk.content);
    const vector = fields[4]!;
    assert.equal(vector.length, 4100);
    assert.equal(vector.readInt16BE(0), 1024);
    assert.equal(vector.readInt16BE(2), 0);
    assert.equal(vector.readFloatBE(4), Math.fround(chunk.embedding[0]!));
    assert.equal(vector.readFloatBE(4096), -1023);
  }
  assert.equal(buffers.at(-1)!.readInt16BE(0), -1);
});

test("binary COPY rejects invalid dimensions and non-finite float32 values", () => {
  for (const embedding of [
    [1],
    Array(1024).fill(NaN),
    Array(1024).fill(Infinity),
    Array(1024).fill(Number.MAX_VALUE),
  ]) {
    assert.throws(
      () => [...binaryChunkRows("guide-1", [{ ...chunk, embedding }])],
      /Invalid 1024-dimensional vector/,
    );
  }
});

test("COPY skips empty batches and propagates stream errors", async () => {
  let queries = 0;
  const client = {
    query() {
      queries++;
      return new Writable({
        write(_buffer, _encoding, done) {
          done(new Error("COPY failed"));
        },
      });
    },
  } as unknown as Pick<PoolClient, "query">;
  await copyChunks(client, "guide-1", []);
  assert.equal(queries, 0);
  await assert.rejects(copyChunks(client, "guide-1", [chunk]), /COPY failed/);
});
