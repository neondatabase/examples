import { createHash } from "node:crypto";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 4096;
export const MAX_CATALOG_BYTES = 2 * 1024 * 1024;
export const MAX_RESPONSE_BYTES = 64 * 1024;
export const IO_TIMEOUT_MS = 30_000;
/** How long one processing attempt holds an image before another can take it. */
export const LEASE_SECONDS = 90;
/** Wait before a retryable failure can be reprocessed. */
export const RETRY_SECONDS = 30;
export const MAX_ATTEMPTS = 3;
/** Uploads are content-addressed, so one image is processed once. */
export const OBJECT_KEY = /^uploads\/([a-f0-9]{64})\.(png|jpg)$/;

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const digest = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
