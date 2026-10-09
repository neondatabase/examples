import { createHash } from "node:crypto";

export const SEARCH_BUCKET = "searchfiles";
export const SEARCH_PREFIX = "documents/";
export const MAX_RECONCILE_OBJECTS = 1000;
export const MAX_OBJECT_BYTES = 80_000;

export function isSearchableObject(key: string): boolean {
  return key.startsWith(SEARCH_PREFIX) && /\.(txt|md|mdx)$/i.test(key);
}

export function objectDocumentId(key: string): string {
  return `object:${createHash("sha256").update(key).digest("hex")}`;
}
