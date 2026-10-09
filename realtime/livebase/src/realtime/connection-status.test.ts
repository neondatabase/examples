import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LiveQueryError, LiveQueryState } from "@neon/realtime/client";

import { hasFailed, toConnectionStatus } from "~/realtime/connection-status";

function status(value: "connecting" | "live" | "stale" | "closed"): LiveQueryState {
  return { status: value, error: undefined };
}

function error(code: string, retryable: boolean): LiveQueryState {
  const failure = Object.assign(new Error("internal error"), { code, retryable }) as LiveQueryError;
  return { status: "error", error: failure };
}

describe("toConnectionStatus", () => {
  it("reports connecting until the first live state", () => {
    assert.equal(toConnectionStatus(status("connecting"), false, true), "connecting");
    assert.equal(toConnectionStatus(status("live"), true, true), "live");
  });

  it("reports reconnecting once a live connection goes stale", () => {
    assert.equal(toConnectionStatus(status("stale"), true, true), "reconnecting");
    assert.equal(toConnectionStatus(status("connecting"), true, true), "reconnecting");
  });

  it("reports failed for a non-retryable error, such as a lost backend session", () => {
    assert.equal(toConnectionStatus(error("backend_protocol_error", false), true, true), "failed");
    assert.equal(toConnectionStatus(error("protocol_error", false), false, true), "failed");
  });

  it("treats a retryable error as still recovering", () => {
    assert.equal(toConnectionStatus(error("authorization_expired", true), true, true), "reconnecting");
    assert.equal(toConnectionStatus(error("authorization_expired", true), false, true), "connecting");
  });

  it("reports offline while the browser is offline, even after a failure", () => {
    assert.equal(toConnectionStatus(status("stale"), true, false), "offline");
    assert.equal(toConnectionStatus(error("backend_protocol_error", false), true, false), "offline");
    assert.equal(toConnectionStatus(status("closed"), true, true), "offline");
  });
});

describe("hasFailed", () => {
  it("is true only for non-retryable errors", () => {
    assert.equal(hasFailed(error("backend_protocol_error", false)), true);
    assert.equal(hasFailed(error("authorization_expired", true)), false);
    assert.equal(hasFailed(status("stale")), false);
  });
});
