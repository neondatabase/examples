import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

// The builders only render SQL here, and sealing is local: it encrypts the
// SQL and never sends it anywhere. `db.server.ts` needs a connection string to
// create its pool, which never connects unless a query runs.
process.env.DATABASE_URL ||= "postgres://livebase-test.invalid/unused";
// A well-formed secret, in the format Neon Realtime issues. It only encrypts.
process.env.NEON_REALTIME_SECRET ||= `nrt_live_1${randomBytes(32).toString("base64url")}`;
const live = await import("./live-queries.server");
const { realtime } = await import("./realtime.server");

// Every builder takes a workspace, and `messagesQuery` also a lead. The Drizzle
// select type is read from what `realtime.seal` accepts.
type SealableQuery = Parameters<(typeof import("./realtime.server"))["realtime"]["seal"]>[0]["query"];
type Builder = (workspaceId: string, leadId: string) => Extract<SealableQuery, { toSQL(): unknown }>;

// Every builder is named `...Query`, so a new one is tested without being listed.
const builders = Object.entries(live)
  .filter(([name]) => name.endsWith("Query")) as [string, Builder][];

describe("spansQuery", () => {
  it("projects the tool call ID out of attributes, and nothing else of that column", () => {
    const { sql, params } = live.spansQuery("ws-1").toSQL();
    assert.match(sql, /"attributes" ->> 'toolCallId' as "toolCallId"/);
    // The whole column would sync every span's attributes to every browser.
    assert.doesNotMatch(sql.replace(/"attributes" ->> 'toolCallId'/, ""), /attributes/);
    // The JSON key is a literal, so the workspace ID stays the only parameter.
    assert.deepEqual(params, ["ws-1"]);
  });

  it("projects error without its stack, and never the whole column", () => {
    const { sql } = live.spansQuery("ws-1").toSQL();
    assert.match(sql, /"error" - 'stack' as "error"/);
    assert.doesNotMatch(sql, /"error" as "error"/);
  });
});

describe("live queries", () => {
  it("finds the nine builders the app seals", () => {
    assert.equal(builders.length, 9, builders.map(([name]) => name).join(", "));
  });

  for (const [name, build] of builders) {
    it(`${name} seals, with no ORDER BY or LIMIT`, async () => {
      const query = build("ws-1", "00000000-0000-4000-8000-000000000001");
      const { sql } = query.toSQL();
      // Each write to a source table resets an ORDER BY or LIMIT subscription,
      // so sorting and limiting happen in TanStack DB.
      assert.doesNotMatch(sql, /\border\s+by\b/i);
      assert.doesNotMatch(sql, /\blimit\b/i);
      // Sealing runs the adapter's SQL checks.
      const sealed = await realtime.seal({ query });
      assert.ok(sealed);
    });
  }
});
