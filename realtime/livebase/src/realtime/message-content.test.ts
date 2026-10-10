import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseMessageContent } from "~/realtime/message-content";

// Mastra stores each message as format 2 JSON: `{ format: 2, parts }`.
function format2(parts: unknown): string {
  return JSON.stringify({ format: 2, parts });
}

function toolPart(toolInvocation: unknown) {
  return { type: "tool-invocation", toolInvocation };
}

describe("parseMessageContent", () => {
  it("reads a pending call with its arguments and no result", () => {
    const content = format2([
      toolPart({ state: "call", toolCallId: "call-1", toolName: "webSearch", args: { query: "Acme" } }),
    ]);

    assert.deepEqual(parseMessageContent(content).toolInvocations, [
      {
        toolCallId: "call-1",
        toolName: "webSearch",
        state: "call",
        args: { query: "Acme" },
        result: undefined,
        error: null,
      },
    ]);
  });

  it("reads a finished call with its arguments and result", () => {
    const content = format2([
      toolPart({
        state: "result",
        toolCallId: "call-1",
        toolName: "webSearch",
        args: { query: "Acme" },
        result: [{ url: "https://acme.com" }],
      }),
    ]);

    assert.deepEqual(parseMessageContent(content).toolInvocations, [
      {
        toolCallId: "call-1",
        toolName: "webSearch",
        state: "result",
        args: { query: "Acme" },
        result: [{ url: "https://acme.com" }],
        error: null,
      },
    ]);
  });

  it("skips text parts and keeps tool calls in the order they appear", () => {
    const content = format2([
      { type: "text", text: "Let me look that up." },
      toolPart({ state: "result", toolCallId: "a", toolName: "webSearch", args: {}, result: "found" }),
      { type: "text", text: "Now the page itself." },
      toolPart({ state: "call", toolCallId: "b", toolName: "fetchPage", args: { url: "https://acme.com" } }),
    ]);

    const invocations = parseMessageContent(content).toolInvocations;
    assert.deepEqual(invocations.map((invocation) => invocation.toolCallId), ["a", "b"]);
  });

  it("reads a failed call's errorText as its error, with no result", () => {
    const content = format2([
      toolPart({
        state: "output-error",
        toolCallId: "call-1",
        toolName: "fetchPage",
        args: { url: "https://acme.com" },
        errorText: "fetch failed",
      }),
    ]);

    assert.deepEqual(parseMessageContent(content).toolInvocations, [
      {
        toolCallId: "call-1",
        toolName: "fetchPage",
        state: "output-error",
        args: { url: "https://acme.com" },
        result: undefined,
        error: "fetch failed",
      },
    ]);
  });

  it("reads the legacy failed shape, a result flagged isError", () => {
    const content = format2([
      toolPart({
        state: "result",
        toolCallId: "call-1",
        toolName: "readWebPage",
        args: {},
        isError: true,
        result: "  connection reset  ",
      }),
    ]);

    const [invocation] = parseMessageContent(content).toolInvocations;
    assert.equal(invocation?.error, "connection reset");
    assert.equal(invocation?.result, "  connection reset  ");
  });

  it("gives a failed call with no error text a generic error", () => {
    for (const toolInvocation of [
      { state: "output-error", toolName: "readWebPage", errorText: "   " },
      { state: "output-error", toolName: "readWebPage", errorText: 42 },
      { state: "output-error", toolName: "readWebPage", errorText: { message: "" } },
      { state: "result", toolName: "readWebPage", isError: true, result: { code: 500 } },
    ]) {
      const [invocation] = parseMessageContent(format2([toolPart(toolInvocation)])).toolInvocations;
      assert.equal(invocation?.error, "Tool call failed", JSON.stringify(toolInvocation));
    }
  });

  it("reads the error message out of an errorText object", () => {
    // What Mastra stores when a tool's transcript transform has no error
    // phase.
    const content = format2([
      toolPart({
        state: "output-error",
        toolCallId: "call-1",
        toolName: "readWebPage",
        args: {},
        errorText: { message: "Tool error payload unavailable" },
      }),
    ]);

    const [invocation] = parseMessageContent(content).toolInvocations;
    assert.equal(invocation?.error, "Tool error payload unavailable");
  });

  it("reads Mastra's input validation failure as a result, not an error", () => {
    // The tool never ran; the rejection is the call's result.
    const result = { error: true, message: "Tool input validation failed for webSearch." };
    const content = format2([
      toolPart({ state: "result", toolCallId: "call-1", toolName: "webSearch", args: { query: 42 }, result }),
    ]);

    const [invocation] = parseMessageContent(content).toolInvocations;
    assert.deepEqual([invocation?.state, invocation?.result, invocation?.error], ["result", result, null]);
  });

  it("passes an error returned as a tool result through unchanged", () => {
    const content = format2([
      toolPart({
        state: "result",
        toolCallId: "call-1",
        toolName: "readWebPage",
        args: {},
        result: { ok: false, error: "404" },
      }),
    ]);

    const [invocation] = parseMessageContent(content).toolInvocations;
    assert.deepEqual(invocation?.result, { ok: false, error: "404" });
    assert.equal(invocation?.error, null);
  });

  it("drops a call without a tool name, since it can't be matched to a step", () => {
    const content = format2([
      toolPart({ state: "call", toolCallId: "missing", args: {} }),
      toolPart({ state: "call", toolCallId: "empty", toolName: "", args: {} }),
      toolPart({ state: "call", toolCallId: "number", toolName: 42, args: {} }),
      toolPart({ state: "call", toolCallId: "kept", toolName: "webSearch", args: {} }),
    ]);

    const invocations = parseMessageContent(content).toolInvocations;
    assert.deepEqual(invocations.map((invocation) => invocation.toolCallId), ["kept"]);
  });

  it("uses empty strings for a missing or non-string call ID and state", () => {
    const content = format2([toolPart({ toolName: "webSearch", toolCallId: 7, state: null })]);

    assert.deepEqual(parseMessageContent(content).toolInvocations, [
      { toolCallId: "", toolName: "webSearch", state: "", args: undefined, result: undefined, error: null },
    ]);
  });

  it("skips malformed parts and keeps the well-formed ones", () => {
    const content = format2([
      null,
      "tool-invocation",
      ["tool-invocation"],
      { type: "tool-invocation" },
      toolPart(null),
      toolPart("webSearch"),
      toolPart([{ toolName: "webSearch" }]),
      { toolInvocation: { toolName: "noType" } },
      toolPart({ state: "call", toolCallId: "ok", toolName: "webSearch", args: {} }),
    ]);

    const invocations = parseMessageContent(content).toolInvocations;
    assert.deepEqual(invocations.map((invocation) => invocation.toolCallId), ["ok"]);
  });

  it("ignores tool parts in other formats", () => {
    const content = format2([
      { type: "tool-webSearch", toolCallId: "call-1", input: { query: "Acme" }, output: "found" },
    ]);

    assert.deepEqual(parseMessageContent(content).toolInvocations, []);
  });

  it("finds no tool calls when parts is missing or not a list", () => {
    for (const content of [
      JSON.stringify({ format: 2 }),
      JSON.stringify({ format: 2, parts: null }),
      JSON.stringify({ format: 2, parts: { 0: toolPart({ toolName: "webSearch" }) } }),
      JSON.stringify({ format: 2, content: "Hello" }),
    ]) {
      assert.deepEqual(parseMessageContent(content).toolInvocations, [], content);
    }
  });

  it("finds no tool calls in JSON that isn't an object", () => {
    for (const content of ["null", "42", '"hello"', "true", JSON.stringify([toolPart({ toolName: "webSearch" })])]) {
      assert.deepEqual(parseMessageContent(content).toolInvocations, [], content);
    }
  });

  it("finds no tool calls in content that isn't JSON, without throwing", () => {
    for (const content of ["", "Hello there", "{ format: 2", "undefined"]) {
      assert.deepEqual(parseMessageContent(content).toolInvocations, [], JSON.stringify(content));
    }
  });
});
