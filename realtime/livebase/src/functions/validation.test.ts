import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import { describeIssue, parseWith, UserError } from "./validation";

const schema = z.object({
  leadId: z.uuid(),
  changes: z.object({
    foundedYear: z.number().int().min(1000).max(9999).nullable(),
    profileUrl: z.string().max(5).nullable(),
  }).partial().strict().refine((changes) => Object.keys(changes).length > 0, "Nothing to update"),
});

const LEAD_ID = "8f2f4c1e-3b1a-4c2d-9e5f-0a1b2c3d4e5f";

// The message `parseWith` rejects with.
function rejection(input: unknown): string {
  try {
    parseWith(schema)(input);
  } catch (error) {
    assert.ok(error instanceof UserError);
    return error.message;
  }
  assert.fail("expected the input to be rejected");
}

describe("parseWith", () => {
  it("returns the parsed input", () => {
    const input = { leadId: LEAD_ID, changes: { foundedYear: 2015 } };
    assert.deepEqual(parseWith(schema)(input), input);
  });

  it("rejects with a custom message as it is", () => {
    assert.equal(rejection({ leadId: LEAD_ID, changes: {} }), "Nothing to update");
  });

  it("names the field in a built-in message, and only reports the first problem", () => {
    assert.equal(rejection({ leadId: "nope", changes: { foundedYear: 999 } }), "Lead ID: Invalid UUID");
    assert.equal(
      rejection({ leadId: LEAD_ID, changes: { foundedYear: 999 } }),
      "Founded year: Too small: expected number to be >=1000",
    );
    assert.equal(
      rejection({ leadId: LEAD_ID, changes: { profileUrl: "https://example.com" } }),
      "Profile URL: Too big: expected string to have <=5 characters",
    );
  });
});

describe("describeIssue", () => {
  it("leaves a message alone when the problem isn't with a field", () => {
    const result = schema.safeParse(null);
    assert.equal(result.success, false);
    assert.equal(describeIssue(result.error?.issues[0]), "Invalid input: expected object, received null");
  });

  it("falls back to a generic message without an issue", () => {
    assert.equal(describeIssue(undefined), "Invalid input");
  });
});
