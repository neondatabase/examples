// Reads an image's format and pixel size from its header bytes, and checks
// that a URL really serves a usable image before the agent records it as an
// avatar (at least 64 px across) or a logo. The UI hot-links these URLs, so a
// URL that 404s, serves an HTML page, or is a tracking pixel must never reach
// a column.

import { safeFetch } from "~/server/enrichment/web/safe-fetch";

export interface ImageInfo {
  format: "png" | "jpeg" | "gif" | "webp" | "avif" | "ico" | "svg" | "unknown";
  width?: number;
  height?: number;
  // SVG has no pixel size.
  vector?: boolean;
}

export function inspectImage(data: Buffer, contentType = ""): ImageInfo {
  if (data.length >= 24 && data.readUInt32BE(0) === 0x89504e47) {
    return { format: "png", width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (data.length >= 10 && data.toString("ascii", 0, 3) === "GIF") {
    return { format: "gif", width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
  }
  if (data.length >= 30 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") {
    return { format: "webp", ...webpSize(data) };
  }
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    return { format: "jpeg", ...jpegSize(data) };
  }
  // Image CDNs negotiate AVIF, which browsers render, so it counts too.
  if (data.length >= 12 && data.toString("ascii", 4, 8) === "ftyp" && /^avi[fs]$/.test(data.toString("ascii", 8, 12))) {
    return { format: "avif", ...avifSize(data) };
  }
  if (data.length >= 6 && data.readUInt16LE(0) === 0 && data.readUInt16LE(2) === 1) {
    const largest = icoEntries(data).sort((a, b) => b.width - a.width)[0];
    return { format: "ico", width: largest?.width, height: largest?.height };
  }
  const head = data.subarray(0, 2_000).toString("utf8");
  if (/svg/i.test(contentType) || /<svg[\s>]/i.test(head)) return { format: "svg", vector: true };
  return { format: "unknown" };
}

export type ImageCheck =
  | {
      readonly ok: true;
      // The final URL after redirects, which is the one to store and hot-link.
      readonly url: string;
      readonly width: number | null;
      readonly height: number | null;
      readonly contentType: string;
    }
  | { readonly ok: false; readonly reason: string };

const IMAGE_MAX_BYTES = 2_000_000;
// Formats the UI can show. AVIF last, so a CDN that negotiates prefers the others.
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif;q=0.8,image/*;q=0.5";

const FORMAT_TYPES: Readonly<Record<Exclude<ImageInfo["format"], "unknown">, string>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};

// Fetches the image through `safeFetch` and passes a raster image whose
// shorter side is at least `minPx`, or a well-formed SVG. Expected failures
// (refusals, HTTP errors, timeouts, the wrong content) come back as
// `{ ok: false, reason }` for the model; an abort propagates.
export async function checkImageUrl(
  url: string,
  options: { readonly minPx: number; readonly signal?: AbortSignal },
): Promise<ImageCheck> {
  let response;
  try {
    response = await safeFetch(url, { accept: IMAGE_ACCEPT, maxBytes: IMAGE_MAX_BYTES, signal: options.signal });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, reason: `HTTP ${response.status} from ${response.url}` };
  }
  const info = inspectImage(response.body, response.contentType);
  if (info.format === "unknown") {
    return { ok: false, reason: `Not an image (${response.contentType || "no content type"})` };
  }
  const contentType = /^image\//i.test(response.contentType) ? response.contentType : FORMAT_TYPES[info.format];
  if (info.format === "svg") {
    if (response.truncated || !isWellFormedSvg(response.body)) {
      return { ok: false, reason: "The SVG is malformed or too large" };
    }
    return { ok: true, url: response.url, width: null, height: null, contentType };
  }
  const { width, height } = info;
  if (!width || !height) return { ok: false, reason: `Couldn't read the ${info.format} image's size` };
  if (Math.min(width, height) < options.minPx) {
    return { ok: false, reason: `The image is ${width}×${height} px; it needs to be at least ${options.minPx} px across` };
  }
  return { ok: true, url: response.url, width, height, contentType };
}

// An SVG document: after any XML prolog, doctype and comments, the root is
// <svg>, and the document ends with </svg>. This rejects HTML pages that only
// embed an <svg>, and bodies cut off at the size cap.
export function isWellFormedSvg(data: Buffer): boolean {
  const text = data.toString("utf8").replace(/^﻿/, "");
  const start = text.replace(/^(?:\s+|<\?xml[\s\S]*?\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->)*/i, "");
  return /^<svg[\s>]/i.test(start) && /<\/svg>\s*(?:<!--[\s\S]*?-->\s*)*$/i.test(text);
}

function icoEntries(data: Buffer) {
  const count = data.readUInt16LE(4);
  const entries: { width: number; height: number; size: number; offset: number; png: boolean }[] = [];
  for (let i = 0; i < count && 6 + i * 16 + 16 <= data.length; i++) {
    const at = 6 + i * 16;
    const size = data.readUInt32LE(at + 8);
    const offset = data.readUInt32LE(at + 12);
    const png = offset + 8 <= data.length && data.readUInt32BE(offset) === 0x89504e47;
    // A 0 in the directory means 256 px.
    let width = data[at] || 256;
    let height = data[at + 1] || 256;
    if (png && offset + 24 <= data.length) {
      width = data.readUInt32BE(offset + 16);
      height = data.readUInt32BE(offset + 20);
    }
    if (offset + size <= data.length) entries.push({ width, height, size, offset, png });
  }
  return entries;
}

function jpegSize(data: Buffer): { width?: number; height?: number } {
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) return {};
    const marker = data[offset + 1]!;
    // Fill bytes: a marker may be preceded by any number of 0xFF.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = data.readUInt16BE(offset + 2);
    // Start-of-frame markers carry the dimensions.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return {};
}

function webpSize(data: Buffer): { width?: number; height?: number } {
  const chunk = data.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  if (chunk === "VP8 ") return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return {};
}

// AVIF keeps its size in the `ispe` (image spatial extents) property:
// a 4-byte box type, 4 bytes of version and flags, then width and height.
function avifSize(data: Buffer): { width?: number; height?: number } {
  const at = data.subarray(0, 4_096).indexOf("ispe", 0, "ascii");
  if (at < 0 || at + 16 > data.length) return {};
  return { width: data.readUInt32BE(at + 8), height: data.readUInt32BE(at + 12) };
}
