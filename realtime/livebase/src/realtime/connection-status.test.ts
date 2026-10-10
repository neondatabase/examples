import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LiveQueryError, LiveQueryState } from "@neon/realtime/client";

import { hasFailed, toConnectionStatus } from "~/realtime/connection-status";

function status(value: "connecting" | "live" | "stale" | "closed"): LiveQueryState {
  return { status: value, error: undefined };
}

function error(code: string): LiveQueryState {
  const failure = Object.assign(new Error("internal error"), { code, retryable: false }) as LiveQueryError;
  return { status: "error", error: failure };
}

describe("toConnectionStatus", () => {
  it("reports connecting until the first live state", () => {
    assert.equal(toConnectionStatus(status("connecting"), false, true, false), "connecting");
    assert.equal(toConnectionStatus(status("live"), true, true, false), "live");
  });

  it("reports reconnecting once a live connection goes stale", () => {
    assert.equal(toConnectionStatus(status("stale"), true, true, false), "reconnecting");
    assert.equal(toConnectionStatus(status("connecting"), true, true, false), "reconnecting");
  });

  it("reports stopped when only the probe subscription failed", () => {
    assert.equal(toConnectionStatus(error("subscription_error"), true, true, false), "stopped");
    assert.equal(toConnectionStatus(error("decode_error"), false, true, false), "stopped");
  });

  it("reports failed when the connection itself has failed, whatever the probe says", () => {
    assert.equal(toConnectionStatus(status("live"), true, true, true), "failed");
    assert.equal(toConnectionStatus(error("subscription_error"), true, true, true), "failed");
  });

  it("reports offline while the browser is offline, even after a failure", () => {
    assert.equal(toConnectionStatus(status("stale"), true, false, false), "offline");
    assert.equal(toConnectionStatus(error("subscription_error"), true, false, false), "offline");
    assert.equal(toConnectionStatus(error("subscription_error"), true, false, true), "offline");
    assert.equal(toConnectionStatus(status("closed"), true, true, false), "offline");
  });
});

describe("hasFailed", () => {
  it("is true for every subscription error, since the SDK reports them all as final", () => {
    assert.equal(hasFailed(error("subscription_error")), true);
    assert.equal(hasFailed(error("backend_protocol_error")), true);
    assert.equal(hasFailed(status("stale")), false);
  });
});
