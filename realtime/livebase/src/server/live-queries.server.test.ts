import assert from "node:assert/strict";
import { describe, it } from "node:test";

// The builders only render SQL here. `db.server.ts` needs a connection string
// to create its pool, which never connects unless a query runs.
process.env.DATABASE_URL ||= "postgres://livebase-test.invalid/unused";
const { spansQuery } = await import("./live-queries.server");

describe("spansQuery", () => {
  it("projects the tool call ID out of attributes, and nothing else of that column", () => {
    const { sql, params } = spansQuery("ws-1").toSQL();
    assert.match(sql, /"attributes" ->> 'toolCallId' as "toolCallId"/);
    // The whole column would sync every span's attributes to every browser.
    assert.doesNotMatch(sql.replace(/"attributes" ->> 'toolCallId'/, ""), /attributes/);
    // The JSON key is a literal, so the workspace ID stays the only parameter.
    assert.deepEqual(params, ["ws-1"]);
  });
});
