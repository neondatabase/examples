import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, mock } from "node:test";

import { OFF_LIMITS_HOSTS, OFF_LIMITS_PATHS, enrichmentKeys } from "~/server/enrichment/config";
import {
  FetchRefused,
  checkUrl,
  hostMatches,
  isOffLimits,
  isPrivateAddress,
  isSearchResultsPage,
  parseRobots,
  robotsAllows,
  robotsRefusal,
  robotsRulesAllow,
  safeFetch,
} from "~/server/enrichment/web/safe-fetch";

// Network tests skip offline.
const offline = process.env.LIVEBASE_OFFLINE === "1";

type Handler = (request: http.IncomingMessage, response: http.ServerResponse) => void;

// Runs `run` against a local server that stands in for every public host.
// safeFetch only reaches standard ports on public addresses, so `http.request`
// is pointed at the server, keeping the Host header so `handler` can tell
// origins apart. Use made-up `.test` hosts: robots.txt is cached per origin.
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
  const redirected = mock.method(http, "request", local);
  try {
    await run();
  } finally {
    redirected.mock.restore();
    server.closeAllConnections();
    server.close();
  }
}

function send(response: http.ServerResponse, status: number, body = "", headers: http.OutgoingHttpHeaders = {}): void {
  response.writeHead(status, { "content-type": "text/plain", ...headers });
  response.end(body);
}

describe("enrichmentKeys", () => {
  it("trims keys and treats empty values as missing", () => {
    assert.deepEqual(enrichmentKeys({ EXA_API_KEY: " exa ", X_BEARER_TOKEN: "", GRAVATAR_API_KEY: "   " }), {
      exaApiKey: "exa",
      xBearerToken: null,
      gravatarApiKey: null,
    });
    assert.deepEqual(enrichmentKeys({}), { exaApiKey: null, xBearerToken: null, gravatarApiKey: null });
  });
});

describe("isPrivateAddress", () => {
  it("blocks loopback, private, link-local, CGNAT and reserved IPv4", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "192.0.2.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      assert.equal(isPrivateAddress(address), true, address);
    }
  });

  it("blocks private IPv6, including IPv4-mapped forms", () => {
    for (const address of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "2001:db8::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::a00:1"]) {
      assert.equal(isPrivateAddress(address), true, address);
    }
  });

  it("blocks IPv6 ranges that embed or translate IPv4, and the 6to4 relay range", () => {
    for (const address of [
      "::7f00:1",
      "::127.0.0.1",
      "::ffff:0:7f00:1",
      "64:ff9b:1::a00:1",
      "2002:7f00:1::1",
      "2002:0808:0808::1",
      "fec0::1",
      "192.88.99.1",
    ]) {
      assert.equal(isPrivateAddress(address), true, address);
    }
  });

  it("allows public addresses", () => {
    for (const address of ["93.184.215.14", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      assert.equal(isPrivateAddress(address), false, address);
    }
  });

  it("treats anything that isn't an IP address as private", () => {
    assert.equal(isPrivateAddress("example.com"), true);
    assert.equal(isPrivateAddress(""), true);
  });
});

describe("hostMatches and isOffLimits", () => {
  it("matches a domain and its subdomains only", () => {
    assert.equal(hostMatches("linkedin.com", "linkedin.com"), true);
    assert.equal(hostMatches("WWW.LinkedIn.com.", "linkedin.com"), true);
    assert.equal(hostMatches("notlinkedin.com", "linkedin.com"), false);
    assert.equal(hostMatches("linkedin.com.evil.io", "linkedin.com"), false);
  });

  it("refuses every off-limits host and its subdomains", () => {
    assert.deepEqual(
      [...OFF_LIMITS_HOSTS],
      [
        "linkedin.com",
        "lnkd.in",
        "licdn.com",
        "news.google.com",
        "zoominfo.com",
        "rocketreach.co",
        "contactout.com",
        "signalhire.com",
        "lusha.com",
        "apollo.io",
        "theorg.com",
        "equilar.com",
      ],
    );
    for (const url of [
      "https://www.linkedin.com/in/dane-knecht/",
      "https://uk.linkedin.com/in/someone",
      "http://lnkd.in/abc",
      "https://news.google.com/rss/search?q=acme",
      "https://www.zoominfo.com/c/acme/1",
      "https://app.apollo.io/",
      "https://theorg.com/org/resend/teams/leadership",
      "https://people.equilar.com/bio/person/jane-doe/123",
    ]) {
      assert.equal(isOffLimits(url), true, url);
    }
  });

  it("refuses archives, caches, translators and reader proxies of off-limits pages", () => {
    for (const url of [
      "https://web.archive.org/web/2024/https://www.linkedin.com/in/dknecht",
      "https://archive.ph/https://www.linkedin.com/in/dknecht",
      "https://r.jina.ai/https://www.linkedin.com/in/dknecht",
      "https://www-linkedin-com.translate.goog/in/dknecht?_x_tr_sl=auto&_x_tr_tl=en",
      "https://translate.google.com/translate?u=https://www.linkedin.com/in/dknecht",
      "https://webcache.googleusercontent.com/search?q=cache:linkedin.com/in/dknecht",
      // Encoded once and twice, as a proxy's own links are.
      "https://web.archive.org/web/2024/https%3A%2F%2Fwww.linkedin.com%2Fin%2Fdknecht",
      "https://proxy.example/fetch?u=https%253A%252F%252Fuk.linkedin.com%252Fin%252Fdknecht",
      "https://media-licdn-com.translate.goog/dms/image/abc",
      "https://web.archive.org/web/2024/https://www.zoominfo.com/p/jane-doe/1",
      "https://web.archive.org/web/2024/https://exa.ai/library/person/abc",
      "https://exa-ai.translate.goog/library/person/abc",
    ]) {
      assert.equal(isOffLimits(url), true, url);
    }
  });

  it("doesn't refuse an archive of another site, or a campaign tag naming LinkedIn", () => {
    for (const url of [
      "https://web.archive.org/web/2024/https://resend.com/about",
      "https://r.jina.ai/https://notlinkedin.com/in/x",
      "https://example.com/linkedin.community/",
      "https://example.com/blog/linkedin-tips",
      "https://resend.com/blog/launch?utm_source=linkedin.com&utm_medium=social",
      "https://resend-com.translate.goog/about",
      "https://web.archive.org/web/2024/https://exa.ai/librarycard",
    ]) {
      assert.equal(isOffLimits(url), false, url);
    }
  });

  it("allows other hosts, and isn't fooled by look-alikes", () => {
    for (const url of ["https://resend.com/about", "https://google.com/", "https://notlinkedin.com/", "https://linkedin.com.example.org/"]) {
      assert.equal(isOffLimits(url), false, url);
    }
    assert.equal(isOffLimits("not a url"), false);
  });

  it("refuses off-limits paths on their host and its subdomains", () => {
    assert.deepEqual([...OFF_LIMITS_PATHS], ["exa.ai/library"]);
    for (const url of [
      "https://exa.ai/library",
      "https://exa.ai/library/",
      "https://exa.ai/library/person/stwq326kh53",
      "https://www.exa.ai/library/person/stwq326kh53?ref=x",
      "https://exa.ai/Library/Person/abc",
      "https://exa.ai/%6Cibrary/person/abc",
      "https://exa.ai//library/person/abc",
      "https://exa.ai/blog/../library/person/abc",
    ]) {
      assert.equal(isOffLimits(url), true, url);
    }
  });

  it("matches off-limits paths by whole segments, on that host only", () => {
    for (const url of [
      "https://exa.ai/",
      "https://exa.ai/blog/people-search",
      "https://exa.ai/librarycard",
      "https://exa.ai/docs/library",
      "https://example.com/library/person/abc",
      "https://notexa.ai/library/person/abc",
      "https://exa.ai/%E0%A4%A",
    ]) {
      assert.equal(isOffLimits(url), false, url);
    }
  });
});

describe("isSearchResultsPage", () => {
  it("recognises search-engine results pages", () => {
    for (const url of [
      "https://www.google.com/search?q=dane+knecht",
      "https://google.co.uk/search?q=acme",
      "https://www.google.com.au/search?q=acme",
      "https://www.bing.com/search?q=acme",
      "https://duckduckgo.com/?q=acme",
      "https://html.duckduckgo.com/html/?q=acme",
      "https://lite.duckduckgo.com/lite/?q=acme",
      "https://search.yahoo.com/search?p=acme",
      "https://uk.search.yahoo.com/search?p=acme",
      "https://yandex.ru/search/?text=acme",
      "https://yandex.com/search/?text=acme",
      "https://www.baidu.com/s?wd=acme",
      "https://search.brave.com/search?q=acme",
      "https://www.startpage.com/do/search?q=acme",
      "https://www.ecosia.org/search?q=acme",
      // Encoded or doubled slashes, and Bing's verticals.
      "https://www.google.com/%73earch?q=acme",
      "https://www.google.com//search?q=acme",
      "https://www.google.com/Search?q=acme",
      "https://www.bing.com/news/search?q=acme",
      "https://www.bing.com/images/search?q=acme",
      "https://www.bing.com/videos/search?q=acme",
      "https://www.bing.com/shop/search?q=acme",
    ]) {
      assert.equal(isSearchResultsPage(url), true, url);
    }
  });

  it("allows other pages on the same hosts, and other sites", () => {
    for (const url of [
      "https://www.google.com/",
      "https://about.google/",
      "https://blog.google/products/search/",
      "https://www.bing.com/maps",
      "https://duckduckgo.com/about",
      "https://www.baidu.com/",
      "https://www.ecosia.org/about",
      "https://example.com/search?q=acme",
      "https://acme.com/search",
      "https://googlesearch.example.com/search",
    ]) {
      assert.equal(isSearchResultsPage(url), false, url);
    }
    assert.equal(isSearchResultsPage("not a url"), false);
  });
});

describe("checkUrl", () => {
  function refusal(raw: string): string {
    try {
      checkUrl(raw);
    } catch (error) {
      assert.ok(error instanceof FetchRefused, `${raw} throws FetchRefused`);
      return error.message;
    }
    assert.fail(`${raw} should be refused`);
  }

  it("accepts public http(s) URLs", () => {
    assert.equal(checkUrl("https://resend.com/about").hostname, "resend.com");
    assert.equal(checkUrl("http://example.com:80/").hostname, "example.com");
  });

  it("refuses bad schemes, ports, credentials and private literals", () => {
    assert.match(refusal("not a url"), /Not a valid URL/);
    assert.match(refusal("ftp://example.com/file"), /Only http and https/);
    assert.match(refusal("file:///etc/passwd"), /Only http and https/);
    assert.match(refusal("https://example.com:8443/"), /standard ports/);
    assert.match(refusal("https://user:pass@example.com/"), /credentials/);
    assert.match(refusal("http://127.0.0.1/"), /Private address/);
    assert.match(refusal("http://[::1]/"), /Private address/);
    assert.match(refusal("http://[::ffff:127.0.0.1]/"), /Private address/);
    // WHATWG URL parsing turns these into 127.0.0.1.
    assert.match(refusal("http://2130706433/"), /Private address/);
    assert.match(refusal("http://0x7f.1/"), /Private address/);
    assert.match(refusal("http://169.254.169.254/latest/meta-data/"), /Private address/);
  });

  it("refuses off-limits hosts", () => {
    assert.match(refusal("https://www.linkedin.com/in/someone"), /linkedin\.com is off-limits/);
    assert.match(refusal("https://media.licdn.com/dms/image/abc"), /media\.licdn\.com is off-limits/);
  });

  it("refuses off-limits paths, naming the section rather than the host", () => {
    assert.equal(refusal("https://exa.ai/library/person/abc"), "exa.ai/library pages are off-limits");
    assert.equal(checkUrl("https://exa.ai/blog/people-search").hostname, "exa.ai");
  });

  it("refuses search results pages and points at webSearch", () => {
    assert.match(refusal("https://www.google.com/search?q=acme"), /webSearch/);
  });

  it("says when a URL proxies an off-limits page", () => {
    assert.match(
      refusal("https://r.jina.ai/https://www.linkedin.com/in/someone"),
      /leads to linkedin\.com content, which is off-limits\. Archives, caches, translators and reader proxies/,
    );
  });
});

describe("robots.txt rules", () => {
  const robots = [
    "User-agent: Googlebot",
    "Disallow: /",
    "",
    "User-agent: *",
    "User-agent: OtherBot",
    "Disallow: /private",
    "Allow: /private/press",
    "Disallow: /*.pdf$",
    "Disallow: /search*q=",
    "Disallow:",
    "# Disallow: /commented",
  ].join("\n");
  const rules = parseRobots(robots);

  it("reads only the groups for User-agent: *", () => {
    assert.deepEqual(rules, [
      { allow: false, pattern: "/private" },
      { allow: true, pattern: "/private/press" },
      { allow: false, pattern: "/*.pdf$" },
      { allow: false, pattern: "/search*q=" },
    ]);
  });

  it("applies the longest match, with wildcards and anchors", () => {
    assert.equal(robotsRulesAllow(rules, "/about"), true);
    assert.equal(robotsRulesAllow(rules, "/private/team"), false);
    assert.equal(robotsRulesAllow(rules, "/private/press/2026"), true);
    assert.equal(robotsRulesAllow(rules, "/files/deck.pdf"), false);
    assert.equal(robotsRulesAllow(rules, "/files/deck.pdf?v=2"), true);
    assert.equal(robotsRulesAllow(rules, "/search?q=acme"), false);
    assert.equal(robotsRulesAllow(rules, "/commented"), true);
    assert.equal(robotsRulesAllow([], "/anything"), true);
  });

  it("lets Allow win a tie", () => {
    assert.equal(robotsRulesAllow([{ allow: false, pattern: "/a" }, { allow: true, pattern: "/a" }], "/a"), true);
  });

  it("decodes unreserved escapes and collapses repeated slashes before matching", () => {
    const disallowed = parseRobots("User-agent: *\nDisallow: /search\nDisallow: /caf%C3%A9\nDisallow: /%7Euser");
    assert.equal(robotsRulesAllow(disallowed, "/%73earch?q=acme"), false);
    assert.equal(robotsRulesAllow(disallowed, "//search"), false);
    assert.equal(robotsRulesAllow(disallowed, "/caf%c3%a9"), false);
    assert.equal(robotsRulesAllow(disallowed, "/~user/page"), false);
    // A reserved character stays encoded: /a%2Fb is not /a/b.
    assert.equal(robotsRulesAllow(parseRobots("User-agent: *\nDisallow: /a/b"), "/a%2Fb"), true);
  });

  it("uses the groups for this crawler's product token when robots.txt names it", () => {
    const text = ["User-agent: *", "Disallow: /private", "", "User-agent: LivebaseEnrichment", "Disallow: /"].join("\n");
    assert.deepEqual(parseRobots(text), [{ allow: false, pattern: "/" }]);
    assert.deepEqual(parseRobots(text, "OtherBot"), [{ allow: false, pattern: "/private" }]);
  });
});

describe("safeFetch (offline)", () => {
  it("refuses a hostname that resolves to a private address", async () => {
    await assert.rejects(safeFetch("http://localhost/"), (error: unknown) => {
      assert.ok(error instanceof FetchRefused);
      assert.match(error.message, /non-public address/);
      return true;
    });
  });

  it("rejects with the abort reason when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(safeFetch("https://example.com/", { signal: controller.signal }), { name: "AbortError" });
    await assert.rejects(robotsAllows("https://example.com/", controller.signal), { name: "AbortError" });
  });

  it("closes a redirect's connection instead of draining its body", async () => {
    let redirectClosed: Promise<unknown> | null = null;
    await withWeb(
      (request, response) => {
        if (request.url !== "/start") return send(response, 200, "final");
        // A redirect whose body never ends.
        response.writeHead(302, { location: "/final", "content-type": "application/octet-stream" });
        redirectClosed = once(response, "close");
        const chunk = Buffer.alloc(64 * 1024, 97);
        const pump = () => {
          while (!response.destroyed && response.write(chunk));
        };
        response.on("drain", pump);
        pump();
      },
      async () => {
        const page = await safeFetch("http://drain.test/start");
        assert.equal(page.body.toString("utf8"), "final");
        assert.equal(page.url, "http://drain.test/final");
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("still streaming")), 1_000));
        await Promise.race([redirectClosed, timeout]);
      },
    );
  });

  it("gives the whole redirect chain one deadline", async () => {
    await withWeb(
      (request, response) => {
        const hop = Number(/^\/r\/(\d+)$/.exec(request.url ?? "")?.[1] ?? 0);
        setTimeout(() => (hop < 5 ? send(response, 302, "", { location: `/r/${hop + 1}` }) : send(response, 200, "end")), 150);
      },
      async () => {
        const started = Date.now();
        // Six hops of 150 ms each fit a per-hop limit of 400 ms, but not a total one.
        await assert.rejects(safeFetch("http://slow-chain.test/r/0", { timeoutMs: 400 }), /Timed out after 400 ms/);
        assert.ok(Date.now() - started < 800);
        assert.equal((await safeFetch("http://slow-chain.test/r/3", { timeoutMs: 2_000 })).body.toString("utf8"), "end");
      },
    );
  });

  it("checks robots.txt on every redirect hop when asked", async () => {
    const hits: string[] = [];
    await withWeb(
      (request, response) => {
        const at = `${request.headers.host}${request.url}`;
        hits.push(at);
        if (at === "hop-a.test/robots.txt") return send(response, 404);
        if (at === "hop-b.test/robots.txt") return send(response, 200, "User-agent: *\nDisallow: /private\n");
        if (at === "hop-a.test/go") return send(response, 301, "", { location: "http://hop-b.test/private/page" });
        if (at === "hop-a.test/open") return send(response, 301, "", { location: "http://hop-b.test/public" });
        send(response, 200, "page");
      },
      async () => {
        await assert.rejects(safeFetch("http://hop-a.test/go", { robots: true }), (error: unknown) => {
          assert.ok(error instanceof FetchRefused);
          assert.equal(
            error.message,
            "robots.txt disallows http://hop-b.test/private/page (redirected from http://hop-a.test/go)",
          );
          return true;
        });
        assert.ok(!hits.includes("hop-b.test/private/page"));
        assert.equal((await safeFetch("http://hop-a.test/open", { robots: true })).body.toString("utf8"), "page");
        assert.deepEqual(hits, [
          "hop-a.test/robots.txt",
          "hop-a.test/go",
          "hop-b.test/robots.txt",
          "hop-a.test/open",
          "hop-b.test/public",
        ]);
        // Without `robots`, nothing checks robots.txt.
        assert.equal((await safeFetch("http://hop-a.test/go")).body.toString("utf8"), "page");
      },
    );
  });

  it("allows all on a 4xx robots.txt, and disallows all on a 5xx, a 429 or no answer", async () => {
    await withWeb(
      (request, response) => {
        if (request.url !== "/robots.txt") return send(response, 200, "page");
        if (request.headers.host === "robots-404.test") return send(response, 404);
        if (request.headers.host === "robots-503.test") return send(response, 503);
        if (request.headers.host === "robots-429.test") return send(response, 429);
        request.socket.destroy();
      },
      async () => {
        assert.equal(await robotsAllows("http://robots-404.test/page"), true);
        assert.equal(await robotsAllows("http://robots-503.test/page"), false);
        assert.equal(await robotsAllows("http://robots-429.test/page"), false);
        assert.equal(await robotsAllows("http://robots-reset.test/page"), false);
        assert.equal(
          await robotsRefusal("http://robots-503.test/page"),
          "http://robots-503.test/robots.txt couldn't be read (HTTP 503), so robots-503.test can't be fetched for now (RFC 9309)",
        );
        await assert.rejects(safeFetch("http://robots-503.test/page", { robots: true }), (error: unknown) => {
          assert.ok(error instanceof FetchRefused);
          assert.match(error.message, /robots\.txt couldn't be read \(HTTP 503\)/);
          return true;
        });
      },
    );
  });

  it("refuses a redirect to a proxy of an off-limits page before requesting it", async () => {
    const hits: string[] = [];
    await withWeb(
      (request, response) => {
        hits.push(`${request.headers.host}${request.url}`);
        send(response, 302, "", { location: "https://web.archive.org/web/2024/https://www.linkedin.com/in/x" });
      },
      async () => {
        await assert.rejects(safeFetch("http://short.test/x"), (error: unknown) => {
          assert.ok(error instanceof FetchRefused);
          assert.match(error.message, /leads to linkedin\.com content/);
          return true;
        });
        assert.deepEqual(hits, ["short.test/x"]);
      },
    );
  });

  it("refuses an off-limits path before any request", async () => {
    await assert.rejects(safeFetch("https://exa.ai/library/person/abc"), (error: unknown) => {
      assert.ok(error instanceof FetchRefused);
      assert.match(error.message, /exa\.ai\/library pages are off-limits/);
      return true;
    });
  });
});

describe("safeFetch (online)", { skip: offline && "LIVEBASE_OFFLINE=1" }, () => {
  it("fetches a public page, caps its size, and honours an abort", async () => {
    const page = await safeFetch("https://example.com/");
    assert.equal(page.status, 200);
    assert.match(page.contentType, /text\/html/);
    assert.match(page.body.toString("utf8"), /Example Domain/);
    assert.equal(page.truncated, false);

    const capped = await safeFetch("https://example.com/", { maxBytes: 100 });
    assert.equal(capped.truncated, true);
    assert.equal(capped.body.length, 100);

    assert.equal(await robotsAllows("https://example.com/"), true);

    const controller = new AbortController();
    const pending = safeFetch("https://example.com/", { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
  });
});
