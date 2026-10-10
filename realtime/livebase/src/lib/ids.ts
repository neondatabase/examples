import { v7 } from "uuid";

// UUIDv7 for client-generated optimistic inserts. The browser mints the
// row's final primary key, so the optimistic row and the synced row share one
// key. Version 7 is time-ordered, which keeps index inserts cheap;
// `crypto.randomUUID()` only makes version 4.
export function newId(): string {
  return v7();
}
