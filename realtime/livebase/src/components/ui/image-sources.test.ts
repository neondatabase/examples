import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  avatarSources,
  brandfetchIconUrl,
  companyLogoKey,
  companyLogoSources,
  faviconServiceUrl,
  firstUsable,
  tooSmall,
} from "~/components/ui/image-sources";

const CLIENT_ID = "test-client-id";

describe("brandfetchIconUrl", () => {
  it("asks for the square icon, with a 404 for unknown brands", () => {
    assert.equal(
      brandfetchIconUrl("resend.com", CLIENT_ID),
      "https://cdn.brandfetch.io/domain/resend.com/w/128/h/128/fallback/404/type/icon?c=test-client-id",
    );
  });

  it("escapes the client ID", () => {
    assert.match(brandfetchIconUrl("resend.com", "a b&c"), /\?c=a%20b%26c$/);
  });
});

describe("faviconServiceUrl", () => {
  it("asks Google's favicon service for 128 px", () => {
    assert.equal(faviconServiceUrl("usefathom.com"), "https://www.google.com/s2/favicons?domain=usefathom.com&sz=128");
  });
});

describe("companyLogoSources", () => {
  it("follows the order: Brandfetch, the recorded logo, then the favicon service", () => {
    const sources = companyLogoSources({ domain: "resend.com", logoUrl: "https://resend.com/apple-touch-icon.png" }, CLIENT_ID);
    assert.deepEqual(
      sources.map((source) => source.url),
      [
        brandfetchIconUrl("resend.com", CLIENT_ID),
        "https://resend.com/apple-touch-icon.png",
        faviconServiceUrl("resend.com"),
      ],
    );
  });

  it("sends Brandfetch the origin it requires and nobody else a referrer", () => {
    const sources = companyLogoSources({ domain: "resend.com", logoUrl: "https://resend.com/icon.png" }, CLIENT_ID);
    assert.deepEqual(
      sources.map((source) => source.referrerPolicy),
      ["strict-origin", "no-referrer", "no-referrer"],
    );
  });

  it("only rejects small favicons, which are what the service sends for unknown domains", () => {
    const sources = companyLogoSources({ domain: "resend.com", logoUrl: "https://resend.com/icon.png" }, CLIENT_ID);
    assert.deepEqual(
      sources.map((source) => source.minPx),
      [0, 0, 32],
    );
  });

  it("skips Brandfetch without a client ID", () => {
    const sources = companyLogoSources({ domain: "resend.com", logoUrl: null }, null);
    assert.deepEqual(
      sources.map((source) => source.url),
      [faviconServiceUrl("resend.com")],
    );
  });

  it("uses the recorded logo alone when there's no domain", () => {
    const sources = companyLogoSources({ domain: null, logoUrl: "https://acme.test/logo.png" }, CLIENT_ID);
    assert.deepEqual(
      sources.map((source) => source.url),
      ["https://acme.test/logo.png"],
    );
  });

  it("is empty, so the monogram shows, with neither a domain nor a logo", () => {
    assert.deepEqual(companyLogoSources({ domain: null, logoUrl: null }, CLIENT_ID), []);
    assert.deepEqual(companyLogoSources({ domain: "  ", logoUrl: "" }, CLIENT_ID), []);
  });

  it("doesn't try the same URL twice", () => {
    const favicon = faviconServiceUrl("resend.com");
    const sources = companyLogoSources({ domain: "resend.com", logoUrl: favicon }, null);
    assert.deepEqual(
      sources.map((source) => source.url),
      [favicon],
    );
  });
});

describe("companyLogoKey", () => {
  it("changes when the domain arrives and when a logo is recorded", () => {
    const none = companyLogoKey({ domain: null, logoUrl: null }, CLIENT_ID);
    const domain = companyLogoKey({ domain: "resend.com", logoUrl: null }, CLIENT_ID);
    const logo = companyLogoKey({ domain: "resend.com", logoUrl: "https://resend.com/icon.png" }, CLIENT_ID);
    assert.equal(none, null);
    assert.notEqual(domain, null);
    assert.notEqual(domain, logo);
  });

  it("is stable while the inputs are, so a re-render doesn't flash", () => {
    const company = { domain: "resend.com", logoUrl: "https://resend.com/icon.png" };
    assert.equal(companyLogoKey(company, CLIENT_ID), companyLogoKey({ ...company }, CLIENT_ID));
  });
});

describe("avatarSources", () => {
  it("offers the recorded avatar with no referrer", () => {
    assert.deepEqual(avatarSources("https://pbs.twimg.com/profile_images/1/a_400x400.jpg"), [
      { url: "https://pbs.twimg.com/profile_images/1/a_400x400.jpg", referrerPolicy: "no-referrer", minPx: 0 },
    ]);
  });

  it("is empty, so the monogram shows, without one", () => {
    assert.deepEqual(avatarSources(null), []);
    assert.deepEqual(avatarSources(undefined), []);
    assert.deepEqual(avatarSources(" "), []);
  });
});

describe("firstUsable", () => {
  const sources = companyLogoSources({ domain: "resend.com", logoUrl: "https://resend.com/icon.png" }, CLIENT_ID);

  it("steps down one source per failure, not straight to the monogram", () => {
    assert.equal(firstUsable(sources, new Set())?.url, sources[0]?.url);
    assert.equal(firstUsable(sources, new Set([sources[0]!.url]))?.url, sources[1]?.url);
    assert.equal(firstUsable(sources, new Set([sources[0]!.url, sources[1]!.url]))?.url, sources[2]?.url);
  });

  it("gives up once every source has failed", () => {
    assert.equal(firstUsable(sources, new Set(sources.map((source) => source.url))), null);
    assert.equal(firstUsable([], new Set()), null);
  });

  it("tries a new URL even after an older one failed", () => {
    const failed = new Set(["https://resend.com/old.png"]);
    const next = companyLogoSources({ domain: null, logoUrl: "https://resend.com/new.png" }, null);
    assert.equal(firstUsable(next, failed)?.url, "https://resend.com/new.png");
  });
});

describe("tooSmall", () => {
  it("rejects images whose shorter side is under the minimum", () => {
    assert.equal(tooSmall(16, 16, 32), true);
    assert.equal(tooSmall(128, 16, 32), true);
    assert.equal(tooSmall(32, 32, 32), false);
    assert.equal(tooSmall(128, 128, 32), false);
  });

  it("accepts anything without a minimum, and unsized SVGs", () => {
    assert.equal(tooSmall(1, 1, 0), false);
    assert.equal(tooSmall(0, 0, 32), false);
  });
});
