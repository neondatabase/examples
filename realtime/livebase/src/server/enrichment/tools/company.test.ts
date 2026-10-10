import assert from "node:assert/strict";
import { Resolver } from "node:dns/promises";
import { once } from "node:events";
import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import { describe, it, mock } from "node:test";

import { RunBudget } from "~/server/enrichment/budget";
import {
  bestIcons,
  checkDomain,
  commonsUrl,
  companyNameForms,
  companyNameTokens,
  companyTools,
  contextWords,
  domainCandidates,
  findCompanyWebsite,
  fitPageResult,
  homepageContextHits,
  homepageNamesCompany,
  imagesOfOtherPeople,
  leadingPersonName,
  personMentions,
  wikidataQuery,
  type PageResult,
} from "~/server/enrichment/tools/company";
import type { ImageCandidate, PageFacts } from "~/server/enrichment/web/page";

// Network tests skip offline, so `npm test` passes without a network.
const offline = process.env.LIVEBASE_OFFLINE === "1";

type Handler = (request: http.IncomingMessage, response: http.ServerResponse) => void;

// Runs `run` against a local server that stands in for every public host,
// over http and https alike. `safeFetch` only reaches standard ports on
// public addresses, so `http.request` and `https.request` are pointed at the
// server, keeping the Host header so `handler` can tell origins apart. Use
// made-up hosts: robots.txt is cached per origin.
async function withWeb(handler: Handler, run: () => Promise<void>): Promise<void> {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const request = http.request;
  const local = ((url: URL, options: http.RequestOptions, callback?: (response: http.IncomingMessage) => void) =>
    request(
      new URL(`${url.pathname}${url.search}`, `http://127.0.0.1:${port}`),
      { ...options, headers: { ...options.headers, host: url.host } },
      callback,
    )) as typeof http.request;
  const mocks = [mock.method(http, "request", local), mock.method(https, "request", local)];
  try {
    await run();
  } finally {
    for (const mocked of mocks) mocked.mock.restore();
    server.closeAllConnections();
    server.close();
  }
}

function send(response: http.ServerResponse, status: number, body = "", headers: http.OutgoingHttpHeaders = {}): void {
  response.writeHead(status, { "content-type": "text/html", ...headers });
  response.end(body);
}

// Answers A and AAAA queries from `answers` (no entry: NXDOMAIN) and records
// every name asked, with no network. MX lookups find nothing.
function fakeDns(answers: Readonly<Record<string, readonly string[]>>): { readonly asked: string[]; restore(): void } {
  const asked: string[] = [];
  const answer = async (name: string, family: 4 | 6) => {
    asked.push(name);
    const addresses = (answers[name] ?? []).filter((address) => address.includes(":") === (family === 6));
    if (!answers[name]) throw Object.assign(new Error(`queryA ENOTFOUND ${name}`), { code: "ENOTFOUND" });
    return addresses;
  };
  const mocks = [
    mock.method(Resolver.prototype, "resolve4", (name: string) => answer(name, 4)),
    mock.method(Resolver.prototype, "resolve6", (name: string) => answer(name, 6)),
    mock.method(Resolver.prototype, "resolveMx", async () => []),
  ];
  return { asked, restore: () => mocks.forEach((mocked) => mocked.mock.restore()) };
}

// Wikidata is down, so findCompanyWebsite falls back to its guessed domains.
function wikidataDown(): { restore(): void } {
  const mocked = mock.method(globalThis, "fetch", async () => {
    throw new Error("offline");
  });
  return { restore: () => mocked.mock.restore() };
}

function facts(fields: Partial<PageFacts>): PageFacts {
  return {
    url: "https://example.com/",
    jsonLd: [],
    icons: [],
    socialLinks: [],
    keyLinks: [],
    images: [],
    text: "",
    ...fields,
  };
}

describe("companyNameTokens", () => {
  it("drops legal forms but keeps descriptors", () => {
    assert.deepEqual(companyNameTokens("Acme, Inc."), ["acme"]);
    assert.deepEqual(companyNameTokens("Acme Holdings Ltd"), ["acme", "holdings"]);
    assert.deepEqual(companyNameTokens("Acme & Co"), ["acme"]);
    assert.deepEqual(companyNameTokens("Modal Labs"), ["modal", "labs"]);
  });

  it("folds accents, apostrophes and ampersands", () => {
    assert.deepEqual(companyNameTokens("Café Noir GmbH"), ["cafe", "noir"]);
    assert.deepEqual(companyNameTokens("Ben & Jerry's"), ["ben", "and", "jerrys"]);
    assert.deepEqual(companyNameTokens("Straße Bau"), ["strasse", "bau"]);
  });
});

describe("companyNameForms", () => {
  it("gives the full name and a short form without corporate words", () => {
    assert.deepEqual(companyNameForms("Modal Labs, Inc."), { full: "modal labs", short: "modal" });
    assert.deepEqual(companyNameForms("The Browser Company"), { full: "browser company", short: "browser" });
    // "Analytics" is part of the name, not a corporate word.
    assert.deepEqual(companyNameForms("Fathom Analytics"), { full: "fathom analytics", short: null });
    assert.equal(companyNameForms("&"), null);
  });
});

describe("domainCandidates", () => {
  it("puts the name's .com first, then the startup TLDs and prefixes", () => {
    // linear.app, usefathom.com and exa.ai are all real company sites.
    assert.deepEqual(domainCandidates("Resend"), [
      "resend.com",
      "resend.io",
      "resend.ai",
      "useresend.com",
      "getresend.com",
      "resend.app",
      "resend.dev",
      "resend.co",
    ]);
  });

  it("joins multi-word names and also tries the brand without its descriptor", () => {
    const candidates = domainCandidates("Fathom Analytics");
    assert.equal(candidates[0], "fathomanalytics.com");
    assert.equal(candidates[1], "fathom.com");
    assert.ok(candidates.includes("usefathom.com"));
    assert.ok(candidates.indexOf("fathom.io") > candidates.indexOf("fathom.com"));
    assert.ok(candidates.indexOf("fathom.ai") > candidates.indexOf("fathom.com"));
  });

  it("strips legal suffixes and treats Labs as a descriptor", () => {
    assert.equal(domainCandidates("Acme Inc")[0], "acme.com");
    assert.equal(domainCandidates("Acme, Inc.")[0], "acme.com");
    assert.equal(domainCandidates("Acme Ltd")[0], "acme.com");
    assert.ok(!domainCandidates("Acme Ltd").some((domain) => domain.includes("ltd")));
    assert.deepEqual(domainCandidates("Modal Labs").slice(0, 3), ["modallabs.com", "modal.com", "modal.io"]);
  });

  it("spells out & and also drops it", () => {
    const candidates = domainCandidates("Marks & Spencer");
    assert.deepEqual(candidates.slice(0, 2), ["marksandspencer.com", "marksspencer.com"]);
    assert.ok(domainCandidates("AT&T").includes("att.com"));
  });

  it("removes spaces, punctuation and accents", () => {
    assert.equal(domainCandidates("Café Noir")[0], "cafenoir.com");
    assert.equal(domainCandidates("  Zürich   Data  Works ")[0], "zurichdataworks.com");
    assert.equal(domainCandidates("Ben & Jerry's")[1], "benjerrys.com");
  });

  it("tries a TLD that the name ends in first", () => {
    const candidates = domainCandidates("Mistral AI");
    assert.equal(candidates[0], "mistral.ai");
    assert.equal(candidates[1], "mistralai.com");
  });

  it("uses a name that is already a domain as is", () => {
    assert.equal(domainCandidates("Cal.com")[0], "cal.com");
    assert.equal(domainCandidates("monday.com")[0], "monday.com");
  });

  it("keeps .com candidates ahead of .io, .ai, .dev and .co", () => {
    for (const name of ["Resend", "Fathom Analytics", "Acme Inc", "Linear"]) {
      const candidates = domainCandidates(name);
      const firstCom = candidates.findIndex((domain) => domain.endsWith(".com"));
      const firstOther = candidates.findIndex((domain) => /\.(io|ai|dev|co)$/.test(domain));
      assert.equal(firstCom, 0, name);
      assert.ok(firstOther > firstCom, name);
    }
  });

  it("returns at most 8 unique, valid domains", () => {
    for (const name of ["The Browser Company", "Fathom Analytics", "Resend", "AT&T", "Mistral AI"]) {
      const candidates = domainCandidates(name);
      assert.ok(candidates.length <= 8, name);
      assert.equal(new Set(candidates).size, candidates.length, name);
      for (const domain of candidates) assert.match(domain, /^[a-z0-9-]+(\.[a-z0-9-]+)+$/, name);
    }
  });

  it("returns nothing for a name with no letters or digits", () => {
    assert.deepEqual(domainCandidates(""), []);
    assert.deepEqual(domainCandidates(" & "), []);
  });

  it("leaves out social networks and off-limits hosts", () => {
    assert.ok(!domainCandidates("LinkedIn").includes("linkedin.com"));
    assert.ok(!domainCandidates("Apollo").includes("apollo.io"));
    assert.ok(!domainCandidates("ZoomInfo").includes("zoominfo.com"));
    assert.ok(!domainCandidates("GitHub").includes("github.com"));
    assert.ok(!domainCandidates("x.com").includes("x.com"));
    assert.equal(domainCandidates("Apollo")[0], "apollo.com");
  });
});

describe("homepageNamesCompany", () => {
  it("accepts the full name in the title", () => {
    const page = facts({ title: "Fathom Analytics: Privacy-first website analytics" });
    assert.equal(homepageNamesCompany(page, "Fathom Analytics"), true);
    assert.equal(homepageNamesCompany(page, "Fathom"), true);
  });

  it("rejects a page that names only part of a multi-word name", () => {
    const page = facts({ title: "Fathom | AI Notetaker for Zoom", siteName: "Fathom", text: "Fathom records your calls." });
    assert.equal(homepageNamesCompany(page, "Fathom Analytics"), false);
  });

  it("accepts the site name, the description and a JSON-LD organisation", () => {
    assert.equal(homepageNamesCompany(facts({ siteName: "Resend" }), "Resend"), true);
    assert.equal(homepageNamesCompany(facts({ description: "Resend is the email API for developers." }), "Resend"), true);
    assert.equal(
      homepageNamesCompany(facts({ jsonLd: [{ type: "Organization", name: "Resend, Inc." }] }), "Resend"),
      true,
    );
    assert.equal(homepageNamesCompany(facts({ jsonLd: [{ type: "Person", name: "Resend" }] }), "Resend"), false);
  });

  it("ignores a wall of customer logos", () => {
    const logo = { url: "https://exa.ai/cognition.svg", alt: "Cognition logo", nearbyText: null, width: null, height: null, source: "img" as const };
    assert.equal(homepageNamesCompany(facts({ title: "Exa | Search API", images: [logo] }), "Cognition"), false);
  });

  it("accepts the short form of a name only where the site names itself", () => {
    const modal = facts({
      title: "Modal: The platform for production AI",
      siteName: "Modal",
      description: "Cloud infrastructure for teams that develop and serve AI applications.",
      text: "Pricing Blog Careers © Modal 2026",
    });
    assert.equal(homepageNamesCompany(modal, "Modal Labs"), true);
    assert.equal(homepageNamesCompany(facts({ description: "Modal runs your code." }), "Modal Labs"), false);
    assert.equal(homepageNamesCompany(facts({ siteName: "Mistral" }), "Mistral AI"), true);
  });

  it("accepts the copyright line, but not a mention elsewhere in the body", () => {
    const footer = facts({
      title: "Modal: High-performance AI infrastructure",
      text: "Run code in the cloud.\nPricing\n© 2025 Modal Labs, Inc. All rights reserved.",
    });
    assert.equal(homepageNamesCompany(footer, "Modal Labs"), true);
    const review = facts({ title: "Top analytics tools", text: "We compared Fathom Analytics with Plausible." });
    assert.equal(homepageNamesCompany(review, "Fathom Analytics"), false);
  });

  it("ignores case, accents, legal forms and & versus and", () => {
    assert.equal(homepageNamesCompany(facts({ title: "CAFE NOIR | Coffee roasters" }), "Café Noir"), true);
    assert.equal(homepageNamesCompany(facts({ title: "Acme" }), "Acme, Inc."), true);
    assert.equal(homepageNamesCompany(facts({ title: "Marks and Spencer | Clothing" }), "Marks & Spencer"), true);
  });

  it("matches whole words only", () => {
    assert.equal(homepageNamesCompany(facts({ title: "Acmeworks | Tools" }), "Acme"), false);
    assert.equal(homepageNamesCompany(facts({ title: "Linearity: design" }), "Linear"), false);
  });

  it("rejects parked and for-sale pages, and a page that only repeats its domain", () => {
    assert.equal(homepageNamesCompany(facts({ title: "acme.io is for sale" }), "Acme"), false);
    assert.equal(
      homepageNamesCompany(facts({ title: "Acme", text: "This domain may be for sale. Make an offer." }), "Acme"),
      false,
    );
    assert.equal(homepageNamesCompany(facts({ title: "Welcome to quorvanta.io" }), "Quorvanta"), false);
    assert.equal(
      homepageNamesCompany(
        facts({ title: "ModalLabs.com is For Sale | BrandBucket", jsonLd: [{ type: "Organization", name: "BrandBucket" }] }),
        "Modal Labs",
      ),
      false,
    );
  });

  it("matches a name that is itself a domain", () => {
    assert.equal(homepageNamesCompany(facts({ title: "Cal.com | Open Scheduling Infrastructure" }), "Cal.com"), true);
  });
});

describe("contextWords and homepageContextHits", () => {
  it("keeps the distinctive words of the context that aren't the name", () => {
    assert.deepEqual(contextWords("serverless Postgres company", "Neon"), ["serverless", "postgres"]);
    assert.deepEqual(contextWords("Neon, the AI search API", "Neon"), ["search", "api"]);
    assert.deepEqual(contextWords(undefined, "Neon"), []);
  });

  it("finds the context words anywhere on the homepage", () => {
    const page = facts({ title: "Neon", text: "Ship faster with serverless Postgres." });
    assert.deepEqual(homepageContextHits(page, ["serverless", "postgres", "film"]), ["serverless", "postgres"]);
    assert.deepEqual(homepageContextHits(facts({ title: "NEON | Films" }), ["serverless"]), []);
  });
});

describe("bestIcons", () => {
  it("orders SVG and the largest icons first and drops duplicates", () => {
    const icons = [
      { url: "https://acme.com/favicon.ico", rel: "shortcut icon" },
      { url: "https://acme.com/favicon.ico", rel: "icon" },
      { url: "https://acme.com/apple-57.png", rel: "apple-touch-icon", sizes: "57x57" },
      { url: "https://acme.com/apple-180.png", rel: "apple-touch-icon", sizes: "180x180" },
      { url: "https://acme.com/icon.svg", rel: "icon", type: "image/svg+xml" },
    ];
    assert.deepEqual(
      bestIcons(icons, 3).map((icon) => icon.url),
      ["https://acme.com/icon.svg", "https://acme.com/apple-180.png", "https://acme.com/apple-57.png"],
    );
    assert.equal(bestIcons(icons).filter((icon) => icon.url.endsWith(".ico")).length, 1);
  });
});

describe("company tools without the network", () => {
  it("refuses LinkedIn and search results pages before fetching, and charges a read", async () => {
    const budget = new RunBudget(new AbortController().signal);
    const { readWebPage } = companyTools(budget);
    const execute = readWebPage.execute as unknown as (input: unknown, context: unknown) => Promise<{ ok: boolean; error?: string }>;
    const linkedin = await execute({ url: "https://www.linkedin.com/in/jane-doe" }, {});
    assert.equal(linkedin.ok, false);
    assert.match(linkedin.error ?? "", /off-limits/);
    const search = await execute({ url: "https://www.google.com/search?q=acme" }, {});
    assert.equal(search.ok, false);
    assert.match(search.error ?? "", /webSearch/);
    assert.equal(budget.used("read"), 2);
  });

  it("rejects a value that isn't a domain", async () => {
    const result = (await checkDomain("not a domain", new AbortController().signal)) as { ok: boolean };
    assert.equal(result.ok, false);
  });

  it("throws when the run is already aborted", async () => {
    const signal = AbortSignal.abort();
    await assert.rejects(findCompanyWebsite("Fathom Analytics", { signal }), { name: "AbortError" });
    await assert.rejects(checkDomain("usefathom.com", signal), { name: "AbortError" });
  });

  it("doesn't count a name that resolves only to private addresses", async () => {
    const dns = fakeDns({
      "host.docker.internal": ["192.168.65.254"],
      "api.svc.cluster.local": ["10.96.0.1", "fd00::1"],
      "public.example": ["10.0.0.1", "93.184.215.14"],
    });
    try {
      const signal = new AbortController().signal;
      const resolves = async (domain: string) => ((await checkDomain(domain, signal)) as { resolves: boolean }).resolves;
      assert.equal(await resolves("host.docker.internal"), false);
      assert.equal(await resolves("api.svc.cluster.local"), false);
      assert.equal(await resolves("public.example"), true);
    } finally {
      dns.restore();
    }
  });

  it("doesn't read a guessed homepage that resolves only to private addresses", async () => {
    const dns = fakeDns({ "acmeinternal.com": ["10.0.0.5"] });
    const wikidata = wikidataDown();
    const hits: string[] = [];
    try {
      await withWeb(
        (request, response) => {
          hits.push(`${request.headers.host}${request.url}`);
          send(response, 200, "<title>Acme Internal</title>");
        },
        async () => {
          assert.equal(await findCompanyWebsite("Acme Internal", { signal: new AbortController().signal }), null);
        },
      );
      assert.ok(dns.asked.includes("acmeinternal.com"));
      assert.deepEqual(hits, []);
    } finally {
      dns.restore();
      wikidata.restore();
    }
  });

  it("follows a homepage redirect only where robots.txt allows", async () => {
    const dns = fakeDns({ "acmewidgets.com": ["93.184.215.14"], "acmegadgets.com": ["93.184.215.14"] });
    const wikidata = wikidataDown();
    const hits: string[] = [];
    try {
      await withWeb(
        (request, response) => {
          const at = `${request.headers.host}${request.url}`;
          hits.push(at);
          if (at === "acmewidgets.com/") return send(response, 301, "", { location: "https://widgets.example/" });
          if (at === "acmegadgets.com/") return send(response, 301, "", { location: "https://gadgets.example/" });
          if (at === "widgets.example/robots.txt") return send(response, 200, "User-agent: *\nDisallow: /\n");
          if (request.url === "/robots.txt") return send(response, 404);
          send(response, 200, `<title>${request.headers.host === "widgets.example" ? "Acme Widgets" : "Acme Gadgets"}</title>`);
        },
        async () => {
          const signal = new AbortController().signal;
          assert.equal(await findCompanyWebsite("Acme Widgets", { signal }), null);
          assert.ok(!hits.includes("widgets.example/"));
          const gadgets = await findCompanyWebsite("Acme Gadgets", { signal });
          assert.equal(gadgets?.domain, "gadgets.example");
        },
      );
    } finally {
      dns.restore();
      wikidata.restore();
    }
  });

  it("refuses a page that a redirect leads to when robots.txt disallows it", async () => {
    await withWeb(
      (request, response) => {
        const at = `${request.headers.host}${request.url}`;
        if (at === "short.example/go") return send(response, 301, "", { location: "https://news.example/private/story" });
        if (at === "news.example/robots.txt") return send(response, 200, "User-agent: *\nDisallow: /private\n");
        if (request.url === "/robots.txt") return send(response, 404);
        send(response, 200, "<title>Private story</title>");
      },
      async () => {
        const budget = new RunBudget(new AbortController().signal);
        const { readWebPage } = companyTools(budget);
        const execute = readWebPage.execute as unknown as (input: unknown, context: unknown) => Promise<{ ok: boolean; error?: string }>;
        const result = await execute({ url: "https://short.example/go" }, {});
        assert.equal(result.ok, false);
        assert.equal(
          result.error,
          "robots.txt disallows https://news.example/private/story (redirected from https://short.example/go)",
        );
      },
    );
  });
});

// A team page with three named photos and the company's logo.
const TEAM_PAGE = `<!doctype html><html><head><title>Team · Acme</title></head><body>
<header><a href="/"><img src="/assets/acme-logo.png" alt="Acme" width="120" height="40"></a></header>
<main><h1>Our team</h1>
<div class="grid">
  <div class="card"><img src="/team/jane.jpg" alt="Jane Doe" width="256" height="256"><h3>Jane Doe</h3><p>Chief Executive Officer</p></div>
  <div class="card"><img src="/team/john.jpg" alt="John Roe" width="256" height="256"><h3>John Roe</h3><p>CTO</p></div>
  <div class="card"><img src="/team/ada.jpg" alt="Ada Lovelace" width="256" height="256"><h3>Ada Lovelace</h3><p>Head of Research</p></div>
</div></main></body></html>`;

type ReadResult = {
  ok: boolean;
  text: string;
  images: { url: string; alt?: string }[];
  otherPeopleImages?: { url: string; alt?: string; nearbyText?: string }[];
};

async function readPage(html: string, input: { url: string; person?: string }): Promise<ReadResult> {
  let result: ReadResult | undefined;
  await withWeb(
    (request, response) => (request.url === "/robots.txt" ? send(response, 404) : send(response, 200, html)),
    async () => {
      const { readWebPage } = companyTools(new RunBudget(new AbortController().signal));
      const execute = readWebPage.execute as unknown as (input: unknown, context: unknown) => Promise<ReadResult>;
      result = await execute(input, {});
    },
  );
  return result!;
}

describe("readWebPage's otherPeopleImages", () => {
  it("gives the person their own photo and colleagues theirs, and the logo to neither", async () => {
    const result = await readPage(TEAM_PAGE, { url: "https://team-a.example/team", person: "Jane Doe" });
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.images.map((image) => image.url),
      ["https://team-a.example/team/jane.jpg"],
    );
    assert.deepEqual(result.otherPeopleImages, [
      { url: "https://team-a.example/team/john.jpg", alt: "John Roe", nearbyText: "John Roe · CTO" },
      { url: "https://team-a.example/team/ada.jpg", alt: "Ada Lovelace", nearbyText: "Ada Lovelace · Head of Research" },
    ]);
  });

  it("leaves the result unchanged without a person", async () => {
    const result = await readPage(TEAM_PAGE, { url: "https://team-b.example/team" });
    assert.equal(result.ok, true);
    assert.equal("otherPeopleImages" in result, false);
    assert.equal(result.images.length, 4);
  });

  it("fits a large team page under the cap without crowding out the text", async () => {
    const card = (i: number) =>
      `<div class="card"><img src="/_next/image?url=%2Fuploads%2Fteam%2Fheadshots%2F2025%2Fperson-${i}-portrait-high-resolution.jpg&w=640&q=75" ` +
      `alt="Person${String.fromCharCode(65 + (i % 26))}ab Member${String.fromCharCode(65 + Math.floor(i / 26))}cd" width="400" height="400">` +
      `<h3>Name ${i}</h3><p>Senior Director of Global Partnerships, Strategic Alliances and Ecosystem Development</p></div>`;
    const html = `<html><head><title>Team</title></head><body><h1>Team</h1><p>${"We build tools for makers. ".repeat(200)}</p>
      <div class="grid">${Array.from({ length: 40 }, (_, i) => card(i)).join("")}</div></body></html>`;
    const result = await readPage(html, { url: "https://team-c.example/team", person: "PersonAab MemberAcd" });
    assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 4_000);
    assert.ok(Buffer.byteLength(result.text) >= 1_000, "the text excerpt keeps its room");
    assert.equal(result.images.length, 1);
    const others = result.otherPeopleImages ?? [];
    assert.ok(others.length >= 4 && others.length <= 6, "colleague photos survive the fit");
    for (const other of others) {
      assert.ok(!other.url.includes("person-0-"), "never the person's own photo");
      assert.ok((other.nearbyText ?? "").length <= 80);
    }
  });
});

describe("leadingPersonName", () => {
  it("finds the name at the start of a label", () => {
    assert.equal(leadingPersonName("Jane Doe"), "Jane Doe");
    assert.equal(leadingPersonName("Photo of Jane Doe"), "Jane Doe");
    assert.equal(leadingPersonName("Jane Doe's headshot"), "Jane Doe");
    assert.equal(leadingPersonName("Jane Doe, CEO of Acme"), "Jane Doe");
    assert.equal(leadingPersonName("Jane Doe · Head of Sales"), "Jane Doe");
    assert.equal(leadingPersonName("Jane Doe - CTO"), "Jane Doe");
    assert.equal(leadingPersonName("Jane Doe (CTO)"), "Jane Doe");
  });

  it("accepts particles, initials, hyphens, apostrophes and accents", () => {
    assert.equal(leadingPersonName("Jean-Luc O'Brien"), "Jean-Luc O'Brien");
    assert.equal(leadingPersonName("Ludwig van Beethoven"), "Ludwig van Beethoven");
    assert.equal(leadingPersonName("John F. Kennedy"), "John F. Kennedy");
    assert.equal(leadingPersonName("María José García López"), "María José García López");
    assert.equal(leadingPersonName("Ronan McDonald"), "Ronan McDonald");
  });

  it("rejects logos, products, titles, group photos and single words", () => {
    for (const label of [
      "Acme Logo",
      "Cash App",
      "Chief Executive Officer",
      "Head of Engineering",
      "Jane Doe and John Roe",
      "From left: Jane Doe, John Roe",
      "Team photo",
      "Our office in Berlin",
      "Ramp",
      "Ann Bea Cat Dee Eve",
      "jane doe",
      "",
      null,
    ]) {
      assert.equal(leadingPersonName(label), null, String(label));
    }
  });
});

describe("imagesOfOtherPeople", () => {
  const image = (fields: Partial<ImageCandidate> & { url: string }): ImageCandidate => ({
    alt: null,
    nearbyText: null,
    width: null,
    height: null,
    source: "img",
    ...fields,
  });

  it("keeps photos labelled with someone else, by alt, card text or JSON-LD Person", () => {
    const page = facts({
      images: [
        image({ url: "https://acme.example/og.png", alt: "John Roe", source: "og" }),
        image({ url: "https://acme.example/ld/ada.jpg", nearbyText: "Person: Ada Lovelace", source: "jsonld" }),
        image({ url: "https://acme.example/ld/org.png", nearbyText: "Organization: Grace Hopper Labs", source: "jsonld" }),
        image({ url: "https://acme.example/team/jane.jpg", alt: "Jane Doe" }),
        image({ url: "https://acme.example/team/john.jpg", alt: "headshot", nearbyText: "John Roe · CTO" }),
        image({ url: "https://acme.example/team/office.jpg", alt: "Our office", nearbyText: "Grace Hopper · Advisor" }),
      ],
    });
    assert.deepEqual(
      imagesOfOtherPeople(page, "Jane Doe").map((other) => other.url),
      ["https://acme.example/ld/ada.jpg", "https://acme.example/team/john.jpg"],
    );
  });

  it("never offers an image that names the person, or one of their own", () => {
    const page = facts({
      images: [
        image({ url: "https://acme.example/a.jpg", alt: "John Roe", nearbyText: "Jane Doe and John Roe" }),
        image({ url: "https://acme.example/b.jpg", alt: "Jane Doé" }),
        image({ url: "https://acme.example/c.jpg", alt: "Grace Hopper" }),
      ],
    });
    const own = [image({ url: "https://acme.example/c.jpg", alt: "Grace Hopper" })];
    assert.deepEqual(imagesOfOtherPeople(page, "Jane Doe", own), []);
  });

  it("leaves out logos and icons by URL, SVG and banner shape", () => {
    const page = facts({
      images: [
        image({ url: "https://acme.example/assets/logos/ramp.png", alt: "Ramp Network" }),
        image({ url: "https://acme.example/customers/open-door.svg", alt: "Open Door" }),
        image({ url: "https://acme.example/customers/blue-bottle.png", alt: "Blue Bottle", width: 600, height: 150 }),
        image({ url: "https://acme.example/team/john.jpg", alt: "John Roe", width: 300, height: 400 }),
      ],
    });
    assert.deepEqual(
      imagesOfOtherPeople(page, "Jane Doe").map((other) => other.alt),
      ["John Roe"],
    );
  });

  it("keeps one photo per name, at most 6, clipping alt and card text", () => {
    const names = ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Edsger Dijkstra", "Barbara Liskov", "Donald Knuth", "Frances Allen"];
    const long = ", Vice President of Global Partnerships and Strategic Alliances, EMEA and APAC";
    const page = facts({
      images: [
        image({ url: "https://acme.example/team/ada-1.jpg", alt: "Ada Lovelace" }),
        ...names.map((name, i) => image({ url: `https://acme.example/team/${i}.jpg`, alt: `${name}${long}`, nearbyText: `${name}${long}${long}` })),
      ],
    });
    const others = imagesOfOtherPeople(page, "Jane Doe");
    assert.equal(others.length, 6);
    assert.equal(others[0]?.url, "https://acme.example/team/ada-1.jpg");
    assert.ok(!others.some((other) => other.url === "https://acme.example/team/0.jpg"), "Ada's second photo is dropped");
    for (const other of others.slice(1)) {
      assert.ok(other.alt!.length <= 60 && other.alt!.endsWith("…"));
      assert.ok(other.nearbyText!.length <= 80 && other.nearbyText!.endsWith("…"));
    }
  });
});

describe("fitPageResult", () => {
  const image = (i: number) => ({ url: `https://example.com/images/team-member-${i}.jpg`, alt: `Team member ${i}` });
  const big: PageResult = {
    ok: true,
    status: 200,
    url: "https://example.com/team",
    title: "Team",
    jsonLd: [],
    icons: [],
    socialLinks: Array.from({ length: 20 }, (_, i) => `https://x.com/account${i}`),
    keyLinks: Array.from({ length: 20 }, (_, i) => ({ text: `Link ${i}`, url: `https://example.com/page-${i}` })),
    images: Array.from({ length: 30 }, (_, i) => image(i)),
    text: "Lorem ipsum dolor sit amet. ".repeat(500),
  };

  it("fits the cap, keeping the first entries of each list and some text", () => {
    const fitted = fitPageResult(big, 4_000);
    assert.ok(Buffer.byteLength(JSON.stringify(fitted)) <= 4_000);
    assert.ok(fitted.images.length > 0 && fitted.images.length < 30);
    assert.deepEqual(fitted.images[0], image(0));
    assert.ok(fitted.text.length > 500);
    assert.ok(fitted.text.endsWith("…"));
  });

  it("leaves a small result unchanged", () => {
    const small: PageResult = { ...big, socialLinks: [], keyLinks: [], images: [image(0)], text: "Hello." };
    assert.deepEqual(fitPageResult(small, 4_000), small);
  });

  it("counts multi-byte characters in bytes", () => {
    const fitted = fitPageResult({ ...big, images: [], keyLinks: [], socialLinks: [], text: "é".repeat(5_000) }, 4_000);
    assert.ok(Buffer.byteLength(JSON.stringify(fitted)) <= 4_000);
  });
});

describe("personMentions", () => {
  const text = [
    "Our team",
    "Ada Lovelace, Chief Executive Officer. Ada founded the company in 2019.",
    "Jane Doé, VP Engineering. Jane leads the platform team.",
  ].join("\n");

  it("returns the text around the person's name, keeping accents and capitals", () => {
    const [snippet] = personMentions(text, "Jane Doe");
    assert.ok(snippet?.includes("Jane Doé, VP Engineering"));
  });

  it("falls back to the last name, and returns nothing for an absent person", () => {
    assert.ok(personMentions("Dr. Lovelace runs research.", "Ada Lovelace")[0]?.includes("Lovelace runs research"));
    assert.deepEqual(personMentions(text, "Grace Hopper"), []);
  });

  it("finds a name glued to the next element's text, but not a longer word", () => {
    const [snippet] = personMentions("Karri SaarinenCo-founder, CEO\nJori LalloCo-founder, CPO", "Karri Saarinen");
    assert.ok(snippet?.includes("Karri SaarinenCo-founder, CEO"));
    assert.deepEqual(personMentions("The Does and Doerrs", "Jane Doe"), []);
  });
});

describe("wikidataQuery", () => {
  it("asks for people's employers, and only humans", () => {
    const query = wikidataQuery(["Q1", "Q2"], "person");
    assert.match(query, /VALUES \?item \{ wd:Q1 wd:Q2 \}/);
    assert.match(query, /\?item wdt:P31 wd:Q5 \./);
    assert.match(query, /wdt:P108 \?employer/);
    assert.match(query, /wdt:P18 \?image/);
    assert.doesNotMatch(query, /P571/);
  });

  it("asks for companies' website, logo, image and X username, and excludes humans", () => {
    const query = wikidataQuery(["Q3"], "company");
    assert.match(query, /FILTER NOT EXISTS \{ \?item wdt:P31 wd:Q5 \}/);
    for (const property of ["P856", "P18", "P2002", "P154", "P571", "P159"]) assert.match(query, new RegExp(`wdt:${property} `));
    assert.doesNotMatch(query, /P108/);
  });
});

describe("commonsUrl", () => {
  it("upgrades to https and asks for a thumbnail when a width is given", () => {
    const file = "http://commons.wikimedia.org/wiki/Special:FilePath/Jane%20Doe.jpg";
    assert.equal(commonsUrl(file), "https://commons.wikimedia.org/wiki/Special:FilePath/Jane%20Doe.jpg");
    assert.equal(commonsUrl(file, 400), "https://commons.wikimedia.org/wiki/Special:FilePath/Jane%20Doe.jpg?width=400");
    assert.equal(commonsUrl(undefined), undefined);
  });
});

describe("findCompanyWebsite (live)", { skip: offline ? "LIVEBASE_OFFLINE=1" : false, timeout: 60_000 }, () => {
  it("finds usefathom.com for Fathom Analytics", async () => {
    const match = await findCompanyWebsite("Fathom Analytics", { signal: AbortSignal.timeout(45_000) });
    assert.equal(match?.domain, "usefathom.com");
  });

  it("finds nothing for a fictional company", async () => {
    const match = await findCompanyWebsite("Quorvexa Holoframe Analytics", { signal: AbortSignal.timeout(45_000) });
    assert.equal(match, null);
  });
});
