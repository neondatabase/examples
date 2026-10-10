// A write the server committed but the sync hasn't delivered yet. `confirmWrite`
// (in `realtime/collections.ts`) rethrows the SDK's timeout or closed-subscription
// rejection as `WRITE_NOT_CONFIRMED`, and the toast shows that message.

export const WRITE_NOT_CONFIRMED = "Your change was saved, but hasn't synced back yet";

// Messages `awaitTxId` rejects with once the server has committed the write but
// the sync hasn't delivered it: the wait timed out, the subscription closed, or
// the collection stopped or was cleaned up. Wording from `@neon/realtime` and
// `@neon/realtime-tanstack`.
const NOT_CONFIRMED_MESSAGES = [
  /^Timed out waiting for live-query transaction \S+$/,
  /^Live-query subscription is closed$/,
  /^Realtime collection is not syncing$/,
  /^Realtime collection was cleaned up$/,
];

// Whether a rejected `awaitTxId` means the write is saved but not yet synced.
export function isNotConfirmedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return NOT_CONFIRMED_MESSAGES.some((pattern) => pattern.test(error.message));
}
