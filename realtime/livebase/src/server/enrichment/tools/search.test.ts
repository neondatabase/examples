import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RUN_LIMITS, type RunBudget } from "~/server/enrichment/budget";
import { OFF_LIMITS_HOSTS, OFF_LIMITS_PATHS } from "~/server/enrichment/config";
import {
  exaCostUsd,
  exaRequestBody,
  fitResults,
  parseLinkedInSlug,
  runWebSearch,
  SEARCH_LIMITS,
  searchResults,
  searchTools,
  snippetChars,
  type SearchBudget,
  type SearchResult,
} from "~/server/enrichment/tools/search";

// No test here calls Exa: requests go to a fake fetch, and responses are
// canned in the shape the live calls returned on 2026-10-04.

describe("parseLinkedInSlug", () => {
  it("strips LinkedIn's trailing ID from the name hint", () => {
    assert.deepEqual(parseLinkedInSlug("https://www.linkedin.com/in/dane-knecht-0a1b2c/"), {
      slug: "dane-knecht-0a1b2c",
      nameHint: "Dane Knecht",
    });
    assert.deepEqual(parseLinkedInSlug("https://www.linkedin.com/in/jane-doe-123456789"), {
      slug: "jane-doe-123456789",
      nameHint: "Jane Doe",
    });
  });

  it("handles locale subdomains, missing schemes, query strings and fragments", () => {
    assert.equal(parseLinkedInSlug("https://uk.linkedin.com/in/jane-doe?trk=people-guest")?.nameHint, "Jane Doe");
    assert.equal(parseLinkedInSlug("linkedin.com/in/jane-doe/")?.slug, "jane-doe");
    assert.equal(parseLinkedInSlug("www.linkedin.com/in/Jane-Doe#about")?.slug, "jane-doe");
    assert.equal(parseLinkedInSlug("  http://de.linkedin.com/in/max-mustermann/de  ")?.nameHint, "Max Mustermann");
  });

  it("ignores punctuation after a URL pasted mid-sentence", () => {
    assert.equal(parseLinkedInSlug("linkedin.com/in/jane-doe.")?.slug, "jane-doe");
    assert.equal(parseLinkedInSlug("https://www.linkedin.com/in/jane-doe-0a1b2c),")?.nameHint, "Jane Doe");
  });

  it("reads the old /pub/ URLs", () => {
    assert.deepEqual(parseLinkedInSlug("https://www.linkedin.com/pub/jane-doe/12/345/678"), {
      slug: "jane-doe",
      nameHint: "Jane Doe",
    });
  });

  it("decodes accents", () => {
    assert.deepEqual(parseLinkedInSlug("https://www.linkedin.com/in/jos%C3%A9-garc%C3%ADa-4b5c6d7e/"), {
      slug: "josé-garcía-4b5c6d7e",
      nameHint: "José García",
    });
  });

  it("drops credentials and keeps three-part names", () => {
    assert.equal(parseLinkedInSlug("https://linkedin.com/in/jane-doe-phd")?.nameHint, "Jane Doe");
    assert.equal(parseLinkedInSlug("https://linkedin.com/in/mary-jane-watson-a1")?.nameHint, "Mary Jane Watson");
  });

  it("gives no name hint for a slug that can't be split into names", () => {
    assert.deepEqual(parseLinkedInSlug("https://www.linkedin.com/in/zenorocha"), { slug: "zenorocha", nameHint: null });
    assert.equal(parseLinkedInSlug("https://www.linkedin.com/in/dknecht-12345")?.nameHint, null);
    assert.equal(parseLinkedInSlug("https://www.linkedin.com/in/jane-2-doe")?.nameHint, null);
  });

  it("returns null for anything that isn't a profile URL", () => {
    assert.equal(parseLinkedInSlug("https://www.linkedin.com/company/acme"), null);
    assert.equal(parseLinkedInSlug("https://www.linkedin.com/in/"), null);
    assert.equal(parseLinkedInSlug("https://www.linkedin.com/feed/"), null);
    assert.equal(parseLinkedInSlug("https://lnkd.in/abc123"), null);
    assert.equal(parseLinkedInSlug("https://notlinkedin.com/in/jane-doe"), null);
    assert.equal(parseLinkedInSlug("https://linkedin.com.evil.example/in/jane-doe"), null);
    assert.equal(parseLinkedInSlug("ftp://linkedin.com/in/jane-doe"), null);
    assert.equal(parseLinkedInSlug("Jane Doe"), null);
    assert.equal(parseLinkedInSlug(""), null);
  });
});

describe("exaRequestBody", () => {
  it("excludes every off-limits host and path, including LinkedIn-derived pages", () => {
    const body = exaRequestBody({ query: "Dane Knecht" }, 400);
    for (const host of OFF_LIMITS_HOSTS) assert.ok(body.excludeDomains?.includes(host), host);
    for (const path of OFF_LIMITS_PATHS) assert.ok(body.excludeDomains?.includes(path), path);
    assert.ok(body.excludeDomains?.includes("exa.ai/library"));
  });

  it("asks for highlights with a text fallback, the default count, and no category", () => {
    const body = exaRequestBody({ query: "Dane Knecht" }, 400);
    assert.equal(body.type, "auto");
    assert.equal(body.numResults, SEARCH_LIMITS.defaultResults);
    assert.equal(body.category, undefined);
    assert.equal(body.includeDomains, undefined);
    assert.deepEqual(body.contents, { highlights: { maxCharacters: 400 }, text: { maxCharacters: 400 } });
  });

  it("passes Exa categories through, and sends github as a domain filter", () => {
    assert.equal(exaRequestBody({ query: "Fathom Analytics", category: "company" }, 400).category, "company");
    assert.equal(exaRequestBody({ query: "Fathom funding", category: "news" }, 400).category, "news");
    assert.equal(exaRequestBody({ query: "Zeno Rocha", category: "personal site" }, 400).category, "personal site");
    const github = exaRequestBody({ query: "Jack Ellis", category: "github" }, 400);
    assert.equal(github.category, undefined);
    assert.deepEqual(github.includeDomains, ["github.com"]);
    assert.ok(github.excludeDomains?.includes("linkedin.com"));
  });

  it("never uses Exa's LinkedIn-built categories", () => {
    for (const category of [undefined, "company", "news", "personal site", "github"] as const) {
      const json = JSON.stringify(exaRequestBody({ query: "x y", category }, 400));
      assert.doesNotMatch(json, /linkedin profile|"people"/);
    }
  });

  it("clamps the result count to 1–8", () => {
    assert.equal(exaRequestBody({ query: "x y", numResults: 20 }, 400).numResults, 8);
    assert.equal(exaRequestBody({ query: "x y", numResults: 0 }, 400).numResults, 1);
    assert.equal(exaRequestBody({ query: "x y", numResults: 3 }, 400).numResults, 3);
  });
});

function exaResult(fields: Record<string, unknown>): Record<string, unknown> {
  return { id: String(fields.url), title: "A page", highlights: ["Some highlight."], ...fields };
}

const CANNED = {
  requestId: "d51964fc",
  resolvedSearchType: "",
  searchTime: 1077.2,
  costDollars: { total: 0.007, search: { neural: 0.007 } },
  results: [
    exaResult({
      url: "https://blog.cloudflare.com/author/dane-knecht/",
      title: "Dane Knecht",
      publishedDate: "2026-04-12T00:00:00.000Z",
      highlights: ["Dane Knecht - Cloudflare Blog\n\n# Dane Knecht\n\nChief Technical Officer • Austin, TX\n...\nDane Knecht"],
      text: "Dane Knecht - Cloudflare Blog",
    }),
    exaResult({ url: "https://www.linkedin.com/in/dane-knecht-0a1b2c/", title: "Dane Knecht | LinkedIn" }),
    exaResult({ url: "https://uk.linkedin.com/in/dane-knecht", title: "Dane Knecht | LinkedIn" }),
    exaResult({ url: "https://www.exa.ai/Library/person/stwq326kh53", title: "Dane Knecht" }),
    exaResult({ url: "https://www.zoominfo.com/p/Dane-Knecht/123", title: "Dane Knecht - ZoomInfo" }),
    exaResult({ url: "https://lnkd.in/abc", title: "Short link" }),
    exaResult({
      url: "https://www.forbes.com/profile/dane-knecht/",
      title: "Dane Knecht",
      author: "Alfred Konuwa Contributor",
      highlights: [],
      text: "CTO, Cloudflare\n...\nto build intelligent agents",
    }),
    exaResult({ url: "https://www.forbes.com/profile/dane-knecht/", title: "Repeat" }),
    exaResult({ url: "javascript:alert(1)", title: "Not a page" }),
    exaResult({ url: "https://exa.ai/blog/people-search", title: "Exa's own blog stays" }),
    "not an object",
  ],
};

describe("searchResults", () => {
  it("drops off-limits and LinkedIn-derived results, repeats and non-http URLs", () => {
    const { results, excluded } = searchResults(CANNED, 400);
    assert.deepEqual(
      results.map((result) => result.url),
      [
        "https://blog.cloudflare.com/author/dane-knecht/",
        "https://www.forbes.com/profile/dane-knecht/",
        "https://exa.ai/blog/people-search",
      ],
    );
    assert.equal(excluded, 5);
    assert.ok(results.every((result) => !/linkedin|lnkd\.in|zoominfo|exa\.ai\/library/.test(result.url)));
  });

  it("builds snippets from highlights, falling back to the page text", () => {
    const [blog, forbes] = searchResults(CANNED, 400).results;
    assert.equal(blog?.snippet, "Dane Knecht - Cloudflare Blog Dane Knecht Chief Technical Officer • Austin, TX … Dane Knecht");
    assert.equal(blog?.publishedDate, "2026-04-12");
    assert.equal(blog?.author, undefined);
    assert.equal(forbes?.snippet, "CTO, Cloudflare … to build intelligent agents");
    assert.equal(forbes?.author, "Alfred Konuwa Contributor");
    assert.equal(forbes?.publishedDate, undefined);
  });

  it("caps snippet length and survives a malformed response", () => {
    const long = { results: [exaResult({ url: "https://example.com/", highlights: ["word ".repeat(400)] })] };
    assert.ok((searchResults(long, 200).results[0]?.snippet.length ?? 0) <= 200);
    assert.deepEqual(searchResults({ error: "nope" }, 200), { results: [], excluded: 0 });
    assert.deepEqual(searchResults(null, 200), { results: [], excluded: 0 });
  });
});

describe("result size", () => {
  function results(count: number, chars: number): SearchResult[] {
    return Array.from({ length: count }, (_, i) => ({
      title: `Result ${i} ${"t".repeat(40)}`,
      url: `https://example-${i}.com/${"p".repeat(30)}`,
      publishedDate: "2026-01-01",
      author: "a".repeat(20),
      snippet: "é".repeat(chars),
    }));
  }

  it("sizes snippets so the most results fit the cap", () => {
    assert.equal(snippetChars(1, 4_000), SEARCH_LIMITS.maxSnippetChars);
    assert.ok(snippetChars(8, 4_000) < snippetChars(5, 4_000));
    assert.ok(snippetChars(8, 4_000) >= SEARCH_LIMITS.minSnippetChars);
  });

  it("shortens snippets evenly until the result fits", () => {
    const fitted = fitResults(results(8, 600), RUN_LIMITS.toolResultBytes);
    assert.equal(fitted.length, 8);
    assert.ok(Buffer.byteLength(JSON.stringify({ ok: true, results: fitted })) <= RUN_LIMITS.toolResultBytes);
    const lengths = fitted.map((result) => result.snippet.length);
    assert.ok(Math.max(...lengths) - Math.min(...lengths) <= 1);
  });

  it("drops trailing results when even the shortest snippets don't fit", () => {
    const fitted = fitResults(results(8, 600), 1_500);
    assert.ok(fitted.length < 8 && fitted.length > 0);
    assert.ok(Buffer.byteLength(JSON.stringify({ ok: true, results: fitted })) <= 1_500);
  });

  it("leaves a result that already fits alone", () => {
    const small = results(2, 50);
    assert.deepEqual(fitResults(small, 4_000), small);
  });
});

describe("exaCostUsd", () => {
  it("uses Exa's reported cost, or the fallback", () => {
    assert.equal(exaCostUsd(CANNED), 0.007);
    assert.equal(exaCostUsd({ results: [] }), SEARCH_LIMITS.fallbackCostUsd);
    assert.equal(exaCostUsd({ costDollars: { total: "free" } }), SEARCH_LIMITS.fallbackCostUsd);
  });
});

interface Call {
  readonly url: string;
  readonly init: RequestInit;
  readonly body: Record<string, unknown>;
}

function fakeFetch(responses: readonly { status: number; body: unknown }[]): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...responses];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {}, body: JSON.parse(String(init?.body)) });
    const next = queue.shift() ?? { status: 500, body: "no more responses" };
    const text = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
    return new Response(text, { status: next.status });
  }) as typeof fetch;
  return { fetch: impl, calls };
}

function fakeBudget(signal = new AbortController().signal): SearchBudget & { costs: [string, number][] } {
  const costs: [string, number][] = [];
  return { signal, limits: RUN_LIMITS, costs, addCost: (source, usd) => void costs.push([source, usd]) };
}

describe("runWebSearch", () => {
  it("posts the request with the key in a header, and charges Exa's cost", async () => {
    const { fetch, calls } = fakeFetch([{ status: 200, body: CANNED }]);
    const budget = fakeBudget();
    const result = await runWebSearch("test-key", { query: "Dane Knecht" }, budget, fetch);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://api.exa.ai/search");
    assert.equal((calls[0]?.init.headers as Record<string, string>)["x-api-key"], "test-key");
    assert.doesNotMatch(String(calls[0]?.init.body), /test-key/);
    assert.equal(calls[0]?.body.query, "Dane Knecht");
    assert.deepEqual(budget.costs, [["exa", 0.007]]);
    assert.equal(result.ok, true);
    assert.equal(result.results.length, 3);
    assert.equal(result.excluded, 5);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) <= RUN_LIMITS.toolResultBytes);
  });

  it("throws a readable error on an HTTP error, without charging", async () => {
    const { fetch } = fakeFetch([{ status: 401, body: { error: "Invalid API key" } }]);
    const budget = fakeBudget();
    await assert.rejects(runWebSearch("test-key", { query: "Dane Knecht" }, budget, fetch), /Exa search failed with HTTP 401/);
    assert.deepEqual(budget.costs, []);
  });

  it("retries a company search once without excludeDomains if Exa rejects the list", async () => {
    const { fetch, calls } = fakeFetch([
      { status: 400, body: { error: "excludeDomains is not supported for the company category" } },
      { status: 200, body: CANNED },
    ]);
    const result = await runWebSearch("test-key", { query: "Cloudflare", category: "company" }, fakeBudget(), fetch);
    assert.equal(calls.length, 2);
    assert.ok(Array.isArray(calls[0]?.body.excludeDomains));
    assert.equal(calls[1]?.body.excludeDomains, undefined);
    assert.equal(calls[1]?.body.category, "company");
    // The off-limits results are still dropped here.
    assert.equal(result.excluded, 5);
  });

  it("doesn't retry other 400s", async () => {
    const { fetch, calls } = fakeFetch([{ status: 400, body: { error: "query is too long" } }]);
    await assert.rejects(runWebSearch("test-key", { query: "x y", category: "news" }, fakeBudget(), fetch), /HTTP 400/);
    assert.equal(calls.length, 1);
  });

  it("lets the run's abort through", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("cancelled", "AbortError"));
    const impl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return new Response("{}");
    }) as typeof fetch;
    await assert.rejects(runWebSearch("test-key", { query: "x y" }, fakeBudget(controller.signal), impl), {
      name: "AbortError",
    });
  });
});

describe("searchTools", () => {
  it("registers no tool without an Exa key", () => {
    const keys = { exaApiKey: null, xBearerToken: null, gravatarApiKey: null };
    assert.deepEqual(searchTools({} as RunBudget, keys), {});
  });

  it("registers webSearch with an Exa key", () => {
    const budget = { signal: new AbortController().signal, limits: RUN_LIMITS } as RunBudget;
    const tools = searchTools(budget, { exaApiKey: "test-key", xBearerToken: null, gravatarApiKey: null });
    assert.equal(tools.webSearch?.id, "webSearch");
  });
});
