import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkImageUrl, inspectImage, isWellFormedSvg } from "~/server/enrichment/web/image";

// Network tests skip offline.
const offline = process.env.LIVEBASE_OFFLINE === "1";

// Header-only fixtures: just enough bytes for each format's size fields.

function png(width: number, height: number): Buffer {
  const data = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data, 0);
  data.writeUInt32BE(13, 8);
  data.write("IHDR", 12, "ascii");
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

function gif(width: number, height: number): Buffer {
  const data = Buffer.alloc(13);
  data.write("GIF89a", 0, "ascii");
  data.writeUInt16LE(width, 6);
  data.writeUInt16LE(height, 8);
  return data;
}

function jpeg(width: number, height: number): Buffer {
  const app0 = Buffer.alloc(18);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(16, 2);
  app0.write("JFIF\0", 4, "ascii");
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  // A fill byte before the SOF marker, which encoders may emit.
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, Buffer.from([0xff]), sof]);
}

function webp(chunk: "VP8X" | "VP8 " | "VP8L", width: number, height: number): Buffer {
  const data = Buffer.alloc(40);
  data.write("RIFF", 0, "ascii");
  data.writeUInt32LE(32, 4);
  data.write("WEBP", 8, "ascii");
  data.write(chunk, 12, "ascii");
  data.writeUInt32LE(20, 16);
  if (chunk === "VP8X") {
    data.writeUIntLE(width - 1, 24, 3);
    data.writeUIntLE(height - 1, 27, 3);
  } else if (chunk === "VP8 ") {
    Buffer.from([0x9d, 0x01, 0x2a]).copy(data, 23);
    data.writeUInt16LE(width, 26);
    data.writeUInt16LE(height, 28);
  } else {
    data[20] = 0x2f;
    data.writeUInt32LE(((width - 1) | ((height - 1) << 14)) >>> 0, 21);
  }
  return data;
}

function avif(width: number, height: number): Buffer {
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write("ftypavif", 4, "ascii");
  const ispe = Buffer.alloc(20);
  ispe.writeUInt32BE(20, 0);
  ispe.write("ispe", 4, "ascii");
  ispe.writeUInt32BE(width, 12);
  ispe.writeUInt32BE(height, 16);
  return Buffer.concat([ftyp, Buffer.alloc(40), ispe]);
}

function ico(sizes: readonly number[]): Buffer {
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  const payload = 8;
  sizes.forEach((size, i) => {
    const at = 6 + i * 16;
    // 0 means 256.
    header[at] = size >= 256 ? 0 : size;
    header[at + 1] = size >= 256 ? 0 : size;
    header.writeUInt32LE(payload, at + 8);
    header.writeUInt32LE(header.length + i * payload, at + 12);
  });
  return Buffer.concat([header, Buffer.alloc(sizes.length * payload)]);
}

const SVG = Buffer.from(
  `<?xml version="1.0" encoding="UTF-8"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>\n`,
);

describe("inspectImage", () => {
  it("reads PNG, GIF and JPEG sizes", () => {
    assert.deepEqual(inspectImage(png(400, 300)), { format: "png", width: 400, height: 300 });
    assert.deepEqual(inspectImage(gif(64, 48)), { format: "gif", width: 64, height: 48 });
    assert.deepEqual(inspectImage(jpeg(1024, 768)), { format: "jpeg", width: 1024, height: 768 });
  });

  it("reads all three WebP layouts", () => {
    assert.deepEqual(inspectImage(webp("VP8X", 460, 460)), { format: "webp", width: 460, height: 460 });
    assert.deepEqual(inspectImage(webp("VP8 ", 320, 200)), { format: "webp", width: 320, height: 200 });
    assert.deepEqual(inspectImage(webp("VP8L", 128, 96)), { format: "webp", width: 128, height: 96 });
  });

  it("reads AVIF from its ispe property", () => {
    assert.deepEqual(inspectImage(avif(512, 256)), { format: "avif", width: 512, height: 256 });
  });

  it("reads the largest ICO entry", () => {
    assert.deepEqual(inspectImage(ico([16, 32, 256])), { format: "ico", width: 256, height: 256 });
  });

  it("recognises SVG by content or content type", () => {
    assert.deepEqual(inspectImage(SVG), { format: "svg", vector: true });
    assert.deepEqual(inspectImage(Buffer.from("<?xml version='1.0'?>"), "image/svg+xml"), { format: "svg", vector: true });
  });

  it("returns unknown for other content, and no size for a cut-off JPEG", () => {
    assert.deepEqual(inspectImage(Buffer.from("<!doctype html><html></html>"), "text/html"), { format: "unknown" });
    assert.deepEqual(inspectImage(Buffer.alloc(0)), { format: "unknown" });
    assert.deepEqual(inspectImage(jpeg(100, 100).subarray(0, 12)), { format: "jpeg" });
  });
});

describe("isWellFormedSvg", () => {
  it("accepts an SVG document with a prolog and comments", () => {
    assert.equal(isWellFormedSvg(SVG), true);
    assert.equal(isWellFormedSvg(Buffer.from("﻿<svg><g/></svg><!-- end -->")), true);
  });

  it("rejects HTML that embeds an SVG, and a cut-off SVG", () => {
    assert.equal(isWellFormedSvg(Buffer.from("<html><body><svg></svg></body></html>")), false);
    assert.equal(isWellFormedSvg(SVG.subarray(0, SVG.length - 10)), false);
  });
});

describe("checkImageUrl (offline)", () => {
  it("returns a reason for refused URLs", async () => {
    const local = await checkImageUrl("http://localhost/avatar.png", { minPx: 64 });
    assert.equal(local.ok, false);
    assert.match(local.ok ? "" : local.reason, /non-public address/);
    const linkedin = await checkImageUrl("https://www.linkedin.com/photo.jpg", { minPx: 64 });
    assert.equal(linkedin.ok, false);
    assert.match(linkedin.ok ? "" : linkedin.reason, /off-limits/);
    const data = await checkImageUrl("data:image/png;base64,iVBORw0KGgo=", { minPx: 64 });
    assert.equal(data.ok, false);
  });

  it("propagates an abort", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      checkImageUrl("https://github.com/github.png", { minPx: 64, signal: controller.signal }),
      { name: "AbortError" },
    );
  });
});

describe("checkImageUrl (online)", { skip: offline && "LIVEBASE_OFFLINE=1" }, () => {
  it("passes a large avatar, follows redirects, and rejects a page or a size miss", async () => {
    const avatar = await checkImageUrl("https://github.com/github.png?size=128", { minPx: 64 });
    assert.equal(avatar.ok, true, avatar.ok ? "" : avatar.reason);
    if (avatar.ok) {
      assert.match(avatar.url, /^https:\/\/avatars\.githubusercontent\.com\//);
      assert.ok((avatar.width ?? 0) >= 64);
      assert.match(avatar.contentType, /^image\//);
    }
    const small = await checkImageUrl("https://github.com/github.png?size=40", { minPx: 64 });
    assert.equal(small.ok, false);
    const page = await checkImageUrl("https://example.com/", { minPx: 64 });
    assert.equal(page.ok, false);
    assert.match(page.ok ? "" : page.reason, /^Not an image \(text\/html/);
  });
});
