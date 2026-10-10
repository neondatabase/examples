import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import { RunBudget } from "~/server/enrichment/budget";
import { enrichmentKeys, type EnrichmentKeys } from "~/server/enrichment/config";
import {
  AVATAR_METHODS,
  X_USER_READ_USD,
  avatarRank,
  githubAvatarUrl,
  gravatarAvatarUrl,
  gravatarHash,
  gravatarSummary,
  normalizeXHandle,
  peopleTools,
  xImage400,
  xProfileSummary,
} from "~/server/enrichment/tools/people";

// Gravatar's documented example: the SHA-256 of "myemailaddress@example.com".
const EXAMPLE_HASH = "84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee";

const noKeys: EnrichmentKeys = { exaApiKey: null, xBearerToken: null, gravatarApiKey: null };
const allKeys: EnrichmentKeys = { exaApiKey: null, xBearerToken: "x-test-token", gravatarApiKey: "gravatar-test-key" };

// Mastra tools take (input, context); these tools ignore the context.
async function run(tool: { execute?: (input: never, context: never) => unknown } | undefined, input: object = {}) {
  assert.ok(tool?.execute, "tool is registered");
  return (await tool.execute(input as never, {} as never)) as Record<string, unknown>;
}

type FetchCall = { url: string; init: RequestInit | undefined };

// Replaces global fetch with canned responses, keyed by a URL prefix.
function stubFetch(routes: Record<string, () => Response>): FetchCall[] {
  const calls: FetchCall[] = [];
  mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    const prefix = Object.keys(routes).find((key) => url.startsWith(key));
    assert.ok(prefix, `unexpected fetch ${url}`);
    return routes[prefix]!();
  });
  return calls;
}

const image = () => new Response(null, { status: 200, headers: { "content-type": "image/jpeg" } });
const notFound = () => new Response("Not Found", { status: 404, headers: { "content-type": "text/html" } });
const json = (body: unknown, status = 200) =>
  () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => mock.restoreAll());

describe("avatar order", () => {
  it("ranks the methods best first", () => {
    assert.deepEqual([...AVATAR_METHODS], ["gravatar", "x", "company_site", "github"]);
    assert.deepEqual(AVATAR_METHODS.map(avatarRank), [0, 1, 2, 3]);
    assert.ok(avatarRank("gravatar") < avatarRank("github"));
  });
});

describe("gravatarHash", () => {
  it("hashes the trimmed, lower-cased address with SHA-256", () => {
    assert.equal(gravatarHash("myemailaddress@example.com"), EXAMPLE_HASH);
    assert.equal(gravatarHash("  MyEmailAddress@example.com \n"), EXAMPLE_HASH);
  });
});

describe("gravatarAvatarUrl", () => {
  it("builds a 400 px URL that 404s on a miss", () => {
    assert.equal(gravatarAvatarUrl("MyEmailAddress@example.com"), `https://gravatar.com/avatar/${EXAMPLE_HASH}?s=400&d=404`);
  });

  it("takes a size, clamped to what Gravatar serves", () => {
    assert.match(gravatarAvatarUrl("a@b.co", 128), /\?s=128&d=404$/);
    assert.match(gravatarAvatarUrl("a@b.co", 5000), /\?s=2048&d=404$/);
    assert.match(gravatarAvatarUrl("a@b.co", 0), /\?s=1&d=404$/);
  });
});

describe("xImage400", () => {
  it("swaps the 48 px suffix for 400 × 400", () => {
    assert.equal(
      xImage400("https://pbs.twimg.com/profile_images/1998201848008679424/OGHs2IoF_normal.png"),
      "https://pbs.twimg.com/profile_images/1998201848008679424/OGHs2IoF_400x400.png",
    );
    assert.equal(
      xImage400("https://pbs.twimg.com/profile_images/1/abc_bigger.jpg"),
      "https://pbs.twimg.com/profile_images/1/abc_400x400.jpg",
    );
    assert.equal(xImage400("https://pbs.twimg.com/profile_images/1/abc_normal"), "https://pbs.twimg.com/profile_images/1/abc_400x400");
  });

  it("leaves other URLs alone", () => {
    const original = "https://pbs.twimg.com/profile_images/1/abc.jpg";
    assert.equal(xImage400(original), original);
    // "_normal" inside the path isn't a size suffix.
    const path = "https://pbs.twimg.com/my_normal_dir/abc.jpg";
    assert.equal(xImage400(path), path);
  });
});

describe("normalizeXHandle", () => {
  it("accepts a handle with or without @", () => {
    assert.equal(normalizeXHandle("@zeno"), "zeno");
    assert.equal(normalizeXHandle("zeno"), "zeno");
    assert.equal(normalizeXHandle(" @ZenoRocha "), "zenorocha");
    assert.equal(normalizeXHandle("dane_k"), "dane_k");
  });

  it("takes the handle from x.com and twitter.com URLs", () => {
    assert.equal(normalizeXHandle("x.com/zeno"), "zeno");
    assert.equal(normalizeXHandle("twitter.com/zeno?s=1"), "zeno");
    assert.equal(normalizeXHandle("https://x.com/zenorocha/"), "zenorocha");
    assert.equal(normalizeXHandle("https://www.twitter.com/Zeno"), "zeno");
    assert.equal(normalizeXHandle("https://mobile.twitter.com/zeno"), "zeno");
    assert.equal(normalizeXHandle("http://twitter.com/zeno/status/123456"), "zeno");
    assert.equal(normalizeXHandle("https://twitter.com/#!/zeno"), "zeno");
    assert.equal(normalizeXHandle("https://x.com/@zeno"), "zeno");
  });

  it("rejects what isn't one handle on X", () => {
    assert.equal(normalizeXHandle(""), null);
    assert.equal(normalizeXHandle("@"), null);
    assert.equal(normalizeXHandle("Zeno Rocha"), null);
    assert.equal(normalizeXHandle("@this_handle_is_too_long"), null);
    assert.equal(normalizeXHandle("https://github.com/zeno"), null);
    assert.equal(normalizeXHandle("https://x.com/"), null);
    assert.equal(normalizeXHandle("https://x.com/home"), null);
    assert.equal(normalizeXHandle("https://x.com/i/lists/123"), null);
    assert.equal(normalizeXHandle("https://twitter.com/intent/follow?screen_name=zeno"), null);
    assert.equal(normalizeXHandle("https://x.com.evil.example/zeno"), null);
    assert.equal(normalizeXHandle("javascript:alert(1)"), null);
  });
});

describe("githubAvatarUrl", () => {
  it("builds the redirecting .png URL with a size", () => {
    assert.equal(githubAvatarUrl("torvalds"), "https://github.com/torvalds.png?size=400");
    assert.equal(githubAvatarUrl("@zenorocha", 200), "https://github.com/zenorocha.png?size=200");
  });
});

describe("gravatarSummary", () => {
  it("keeps the useful fields, finds the X handle, and drops off-limits links", () => {
    const summary = gravatarSummary({
      display_name: "Matt",
      first_name: "Matt",
      last_name: "Mullenweg",
      profile_url: "https://gravatar.com/matt",
      job_title: "",
      company: "Automattic",
      location: "  ",
      description: "Open source\n\nperson",
      verified_accounts: [
        { service_type: "twitter", service_label: "X", url: "https://x.com/photomatt" },
        { service_type: "linkedin", service_label: "LinkedIn", url: "https://www.linkedin.com/in/mattm" },
        { service_type: "github", service_label: "GitHub", url: "https://github.com/hidden", is_hidden: true },
      ],
      links: [
        { label: "Ma.tt", url: "http://ma.tt" },
        { label: "LinkedIn", url: "https://linkedin.com/in/mattm" },
        { label: "Bad", url: "javascript:alert(1)" },
      ],
    });
    assert.equal(summary.displayName, "Matt");
    assert.equal(summary.fullName, "Matt Mullenweg");
    assert.equal(summary.company, "Automattic");
    assert.equal(summary.jobTitle, undefined);
    assert.equal(summary.location, undefined);
    assert.equal(summary.about, "Open source person");
    assert.equal(summary.xHandle, "photomatt");
    assert.deepEqual(summary.verifiedAccounts, [{ service: "X", url: "https://x.com/photomatt" }]);
    assert.deepEqual(summary.links, [{ label: "Ma.tt", url: "http://ma.tt" }]);
  });
});

describe("xProfileSummary", () => {
  it("expands t.co links and asks for the 400 × 400 photo", () => {
    const summary = xProfileSummary(
      {
        username: "photomatt",
        name: "Matt Mullenweg",
        description: "CEO of https://t.co/abc",
        url: "https://t.co/Rza2AAxUBV",
        profile_image_url: "https://pbs.twimg.com/profile_images/1/OGHs2IoF_normal.png",
        verified: true,
        verified_type: "blue",
        entities: {
          url: { urls: [{ url: "https://t.co/Rza2AAxUBV", expanded_url: "https://ma.tt/about" }] },
          description: { urls: [{ url: "https://t.co/abc", expanded_url: "https://automattic.com" }] },
        },
      },
      "photomatt",
    );
    assert.deepEqual(summary, {
      username: "photomatt",
      profileUrl: "https://x.com/photomatt",
      name: "Matt Mullenweg",
      bio: "CEO of https://automattic.com",
      website: "https://ma.tt/about",
      verified: true,
      verifiedType: "blue",
      avatarUrl: "https://pbs.twimg.com/profile_images/1/OGHs2IoF_400x400.png",
    });
  });

  it("gives no avatar for X's default image", () => {
    const summary = xProfileSummary(
      { name: "Nobody", profile_image_url: "https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png" },
      "nobody",
    );
    assert.equal(summary.avatarUrl, null);
    assert.equal(summary.username, "nobody");
    assert.equal(summary.website, null);
    assert.equal(summary.bio, null);
  });
});

describe("peopleTools", () => {
  const budget = () => new RunBudget(new AbortController().signal);

  it("registers each tool only when it can run", () => {
    assert.deepEqual(Object.keys(peopleTools(budget(), noKeys, { email: null })), []);
    assert.deepEqual(Object.keys(peopleTools(budget(), noKeys, { email: "not an email" })), []);
    assert.deepEqual(Object.keys(peopleTools(budget(), noKeys, { email: "jane@acme.com" })), ["lookupGravatar"]);
    assert.deepEqual(Object.keys(peopleTools(budget(), allKeys, { email: null })), ["lookupXProfile"]);
  });

  it("checks only the public avatar without a Gravatar key", async () => {
    const calls = stubFetch({ "https://gravatar.com/avatar/": image });
    const result = await run(peopleTools(budget(), noKeys, { email: " Jane@Acme.com " }).lookupGravatar);
    assert.deepEqual(result, { ok: true, avatarUrl: gravatarAvatarUrl("jane@acme.com") });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.init?.method, "HEAD");
  });

  it("reports a miss to the model", async () => {
    stubFetch({ "https://gravatar.com/avatar/": notFound, "https://api.gravatar.com/v3/profiles/": json({ error: "Profile not found" }, 404) });
    const result = await run(peopleTools(budget(), allKeys, { email: "jane@acme.com" }).lookupGravatar);
    assert.equal(result.ok, false);
    assert.match(String(result.error), /No Gravatar/);
  });

  it("adds the profile with a key, sending it as a Bearer token", async () => {
    const calls = stubFetch({
      "https://gravatar.com/avatar/": image,
      "https://api.gravatar.com/v3/profiles/": json({
        display_name: "Jane Doe",
        job_title: "VP Engineering",
        company: "Acme",
        verified_accounts: [{ service_type: "twitter", service_label: "X", url: "https://x.com/janedoe" }],
      }),
    });
    const result = await run(peopleTools(budget(), allKeys, { email: "jane@acme.com" }).lookupGravatar);
    assert.equal(result.ok, true);
    assert.equal(result.avatarUrl, gravatarAvatarUrl("jane@acme.com"));
    assert.equal(result.jobTitle, "VP Engineering");
    assert.equal(result.company, "Acme");
    assert.equal(result.xHandle, "janedoe");
    const profileCall = calls.find((call) => call.url.startsWith("https://api.gravatar.com/"));
    assert.equal(profileCall?.url, `https://api.gravatar.com/v3/profiles/${gravatarHash("jane@acme.com")}`);
    assert.equal(new Headers(profileCall?.init?.headers).get("authorization"), "Bearer gravatar-test-key");
  });

  it("charges the budget's lookup counter", async () => {
    stubFetch({ "https://gravatar.com/avatar/": image });
    const runBudget = budget();
    await run(peopleTools(runBudget, noKeys, { email: "jane@acme.com" }).lookupGravatar);
    assert.equal(runBudget.used("lookup"), 1);
  });

  it("looks up an X user, returns the 400 px photo, and charges the read", async () => {
    const calls = stubFetch({
      "https://api.x.com/2/users/by/username/": json({
        data: {
          id: "1",
          username: "ZenoRocha",
          name: "Zeno Rocha",
          description: "Founder of Resend",
          profile_image_url: "https://pbs.twimg.com/profile_images/1/z_normal.jpg",
          verified: false,
        },
      }),
    });
    const runBudget = budget();
    const result = await run(peopleTools(runBudget, allKeys, { email: null }).lookupXProfile, {
      username: "https://x.com/ZenoRocha",
      reason: "linked from resend.com/about",
    });
    assert.equal(result.ok, true);
    assert.equal(result.username, "ZenoRocha");
    assert.equal(result.avatarUrl, "https://pbs.twimg.com/profile_images/1/z_400x400.jpg");
    assert.match(calls[0]!.url, /^https:\/\/api\.x\.com\/2\/users\/by\/username\/zenorocha\?user\.fields=/);
    assert.equal(new Headers(calls[0]!.init?.headers).get("authorization"), "Bearer x-test-token");
    assert.equal(runBudget.used("x"), 1);
    assert.equal(runBudget.costBySource().x, X_USER_READ_USD);
  });

  it("charges nothing for an unknown X user", async () => {
    stubFetch({
      "https://api.x.com/": json({ errors: [{ title: "Not Found Error", detail: "Could not find user" }] }),
    });
    const runBudget = budget();
    const result = await run(peopleTools(runBudget, allKeys, { email: null }).lookupXProfile, {
      username: "@nobody_here",
      reason: "test",
    });
    assert.equal(result.ok, false);
    assert.match(String(result.error), /No X user @nobody_here/);
    assert.equal(runBudget.costUsd, 0);
  });

  it("refuses a value that isn't a handle without calling X", async () => {
    const calls = stubFetch({});
    const result = await run(peopleTools(budget(), allKeys, { email: null }).lookupXProfile, {
      username: "Zeno Rocha",
      reason: "test",
    });
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  });

  it("tells the model to stop when X refuses the token", async () => {
    stubFetch({ "https://api.x.com/": json({ title: "Forbidden" }, 403) });
    const result = await run(peopleTools(budget(), allKeys, { email: null }).lookupXProfile, {
      username: "zeno",
      reason: "test",
    });
    assert.equal(result.ok, false);
    assert.match(String(result.error), /HTTP 403: Forbidden.*Don't call lookupXProfile again/);
  });
});

// One real Gravatar miss, end to end: the public avatar 404s (d=404) and, with
// a key, so does the profile API. Never touches X, which bills per call.
const offline = process.env.LIVEBASE_OFFLINE === "1";

describe("lookupGravatar online", { skip: offline && "LIVEBASE_OFFLINE=1" }, () => {
  it("reports no avatar for an address with no Gravatar", async () => {
    const keys = { ...enrichmentKeys(), xBearerToken: null };
    const tools = peopleTools(new RunBudget(new AbortController().signal), keys, {
      email: "nobody-livebase-test@example.invalid",
    });
    const result = await run(tools.lookupGravatar);
    assert.equal(result.ok, false);
    assert.match(String(result.error), /No Gravatar/);
  });
});
