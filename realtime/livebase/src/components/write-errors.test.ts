import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WRITE_FAILED,
  currentWriteError,
  dismissWriteError,
  showWriteError,
  subscribeToWriteErrors,
  writeErrorMessage,
} from "~/components/write-errors";
import { WRITE_NOT_CONFIRMED } from "~/lib/write-confirmation";

describe("writeErrorMessage", () => {
  it("shows a server function's message as it is", () => {
    // TanStack Start rebuilds a server error as `new Error(message)`.
    assert.equal(
      writeErrorMessage(new Error("Another person already has this email")),
      "Another person already has this email",
    );
    assert.equal(writeErrorMessage(new Error("  Lead not found ")), "Lead not found");
  });

  it("says nothing for a write rolled back after an earlier one failed", () => {
    assert.equal(writeErrorMessage(undefined), null);
    assert.equal(writeErrorMessage(null), null);
  });

  it("falls back when there's no message meant for users", () => {
    assert.equal(writeErrorMessage(new Error("")), WRITE_FAILED);
    assert.equal(writeErrorMessage("boom"), WRITE_FAILED);
    assert.equal(writeErrorMessage({ message: "Lead not found" }), WRITE_FAILED);
    // A dropped connection.
    assert.equal(writeErrorMessage(new TypeError("Failed to fetch")), WRITE_FAILED);
    // A library's own error class.
    const library = new Error("Collection is in error state");
    library.name = "TanStackDBError";
    assert.equal(writeErrorMessage(library), WRITE_FAILED);
  });

  it("falls back for a response body instead of a sentence", () => {
    const zodDump = '[\n  {\n    "code": "custom",\n    "message": "Nothing to update"\n  }\n]';
    assert.equal(writeErrorMessage(new Error(zodDump)), WRITE_FAILED);
    assert.equal(writeErrorMessage(new Error("x".repeat(201))), WRITE_FAILED);
  });

  it("says a write was saved when the sync confirmation failed", () => {
    // `confirmWrite` rethrows these as the saved message.
    assert.equal(writeErrorMessage(new Error(WRITE_NOT_CONFIRMED)), WRITE_NOT_CONFIRMED);
  });
});

describe("the write error store", () => {
  it("keeps only the latest message, and a stale dismiss leaves it showing", () => {
    let notified = 0;
    const unsubscribe = subscribeToWriteErrors(() => notified++);

    showWriteError(new Error("Another company already has this domain"));
    const first = currentWriteError();
    assert.equal(first?.message, "Another company already has this domain");

    showWriteError(new Error("Another company already has this domain"));
    const second = currentWriteError();
    assert.notEqual(second?.id, first?.id);
    assert.equal(notified, 2);

    dismissWriteError(first!.id);
    assert.equal(currentWriteError(), second);

    dismissWriteError(second!.id);
    assert.equal(currentWriteError(), null);
    assert.equal(notified, 3);

    unsubscribe();
  });

  it("ignores a rejection with no error", () => {
    let notified = 0;
    const unsubscribe = subscribeToWriteErrors(() => notified++);
    showWriteError(undefined);
    assert.equal(currentWriteError(), null);
    assert.equal(notified, 0);
    unsubscribe();
  });
});
