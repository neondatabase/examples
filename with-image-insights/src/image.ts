import {
  digest,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  OBJECT_KEY,
} from "./config.ts";

export class ImageError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export function inspectImage(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES)
    throw new ImageError("image_size_limit");
  const b = Buffer.from(bytes);
  let width = 0;
  let height = 0;
  let contentType: "image/png" | "image/jpeg";
  if (
    b.length >= 33 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    b.readUInt32BE(8) === 13 &&
    b.toString("ascii", 12, 16) === "IHDR"
  ) {
    contentType = "image/png";
    width = b.readUInt32BE(16);
    height = b.readUInt32BE(20);
  } else if (b[0] === 0xff && b[1] === 0xd8) {
    contentType = "image/jpeg";
    // Locate a JPEG start-of-frame segment without decoding pixel data.
    let offset = 2;
    while (offset + 4 <= b.length) {
      if (b[offset++] !== 0xff) break;
      while (b[offset] === 0xff) offset++;
      const marker = b[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > b.length) break;
      const length = b.readUInt16BE(offset);
      if (length < 2 || offset + length > b.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
        height = b.readUInt16BE(offset + 3);
        width = b.readUInt16BE(offset + 5);
        break;
      }
      offset += length;
    }
  } else throw new ImageError("unsupported_image_type");
  if (
    !width ||
    !height ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION
  )
    throw new ImageError("image_dimension_limit");
  const sha256 = digest(bytes);
  return {
    contentType,
    width,
    height,
    sha256,
    bytes: bytes.length,
    key: `uploads/${sha256}.${contentType === "image/png" ? "png" : "jpg"}`,
  };
}

export function verifyImage(
  key: string,
  bytes: Uint8Array,
  declaredType?: string,
) {
  const info = inspectImage(bytes);
  if (!OBJECT_KEY.test(key) || info.key !== key)
    throw new ImageError("image_content_mismatch");
  if (declaredType?.split(";")[0].trim().toLowerCase() !== info.contentType)
    throw new ImageError("image_content_type_mismatch");
  return info;
}
