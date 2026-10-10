import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isNotConfirmedError } from "~/lib/write-confirmation";

// The messages `awaitTxId` really rejects with, from `@neon/realtime` and
// `@neon/realtime-tanstack`.
describe("isNotConfirmedError", () => {
  it("matches the SDK's not-confirmed messages", () => {
    assert.equal(isNotConfirmedError(new Error("Timed out waiting for live-query transaction 4821")), true);
    assert.equal(isNotConfirmedError(new Error("Live-query subscription is closed")), true);
    assert.equal(isNotConfirmedError(new Error("Realtime collection is not syncing")), true);
    assert.equal(isNotConfirmedError(new Error("Realtime collection was cleaned up")), true);
  });

  it("leaves other errors alone", () => {
    assert.equal(isNotConfirmedError(new Error("Timed out waiting for live-query rows")), false);
    assert.equal(isNotConfirmedError(new Error("Lead not found")), false);
    assert.equal(isNotConfirmedError(new Error("Live-query transaction timeout must be a non-negative number")), false);
    assert.equal(isNotConfirmedError("Live-query subscription is closed"), false);
    assert.equal(isNotConfirmedError(undefined), false);
  });
});
