import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { modelCallError } from "./model-errors";

// An error shaped like the AI SDK's `APICallError`.
function apiCallError(statusCode: number | undefined, responseBody: unknown, message = "Too Many Requests"): Error {
  return Object.assign(new Error(message), { statusCode, responseBody });
}

describe("modelCallError", () => {
  it("keeps the status, code, and first sentence of a gateway refusal", () => {
    const error = apiCallError(
      429,
      '{"error_code":"REQUEST_LIMIT_EXCEEDED","message":"ai gateway account daily spend limit exceeded. Retry after the daily spend limit resets, or request a higher limit through Neon support: https://neon.com/docs/introduction/support"}\n',
    );
    const result = modelCallError(error);
    assert.equal(result.message, "429 REQUEST_LIMIT_EXCEEDED: ai gateway account daily spend limit exceeded.");
    assert.equal(result.cause, error);
  });

  it("reads a reason nested under error, and drops a trailing link", () => {
    const error = apiCallError(
      401,
      '{"error":{"message":"invalid or missing credential. Use an active AI Gateway credential in the Authorization bearer header. https://neon.com/docs/ai-gateway/authentication","recovery_url":"https://neon.com/docs/ai-gateway/authentication"}}\n',
      "invalid or missing credential. Use an active AI Gateway credential in the Authorization bearer header. https://neon.com/docs/ai-gateway/authentication",
    );
    assert.equal(modelCallError(error).message, "401 invalid or missing credential.");
  });

  it("prefers the code to the type, and strips a link inside the sentence", () => {
    const error = apiCallError(
      400,
      '{"error":{"message":"Invalid model name. See https://x.example/?key=secret","type":"invalid_request_error","code":"model_not_found"}}',
      "Bad Request",
    );
    const { message } = modelCallError(error);
    assert.equal(message, "400 model_not_found: Invalid model name.");
    assert.doesNotMatch(message, /secret|https?:/);
  });

  it("falls back to the type for an Anthropic-style body", () => {
    const error = apiCallError(529, '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}', "");
    assert.equal(modelCallError(error).message, "529 overloaded_error: Overloaded");
  });

  it("caps a long message at 140 characters", () => {
    const error = apiCallError(500, JSON.stringify({ error_code: "INTERNAL", message: "x".repeat(400) }), "Internal Server Error");
    const { message } = modelCallError(error);
    assert.equal(message.length, 140);
    assert.ok(message.startsWith("500 INTERNAL: xxx"));
    assert.ok(message.endsWith("…"));
  });

  it("leaves out the status when there is none", () => {
    const error = apiCallError(undefined, '{"error_code":"BAD","message":"Nope."}');
    assert.equal(modelCallError(error).message, "BAD: Nope.");
  });

  it("returns the error unchanged when the body says nothing useful", () => {
    const cases = [
      apiCallError(502, "<html>Bad gateway</html>", "Bad Gateway"),
      apiCallError(500, '{"error":{}}', "Internal Server Error"),
      apiCallError(500, "null", "Internal Server Error"),
      apiCallError(500, { message: "not a string body" }, "Internal Server Error"),
      new Error("fetch failed"),
    ];
    for (const error of cases) assert.equal(modelCallError(error), error);
  });

  it("passes an abort through unchanged", () => {
    const abort = new DOMException("This operation was aborted", "AbortError");
    assert.equal(modelCallError(abort), abort);
  });
});
