import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  companyDomainFromEmail,
  companyNameFromDomain,
  isPersonalEmailDomain,
  nameKey,
  normalizeDomain,
  normalizeEmail,
  normalizeName,
  normalizeUrl,
} from "~/lib/normalize";

describe("normalizeEmail", () => {
  it("trims and lowercases an address", () => {
    assert.equal(normalizeEmail("  Jane.Doe@Acme.COM "), "jane.doe@acme.com");
  });

  it("unwraps a mailto: prefix", () => {
    assert.equal(normalizeEmail("mailto:jane@acme.com"), "jane@acme.com");
  });

  it("unwraps angle brackets, with or without a display name or mailto:", () => {
    assert.equal(normalizeEmail("<jane@acme.com>"), "jane@acme.com");
    assert.equal(normalizeEmail("<mailto:jane@acme.com>"), "jane@acme.com");
    assert.equal(normalizeEmail("Jane Doe <Jane@Acme.com>"), "jane@acme.com");
  });

  it("rejects text without a local part and an @", () => {
    assert.equal(normalizeEmail("jane.acme.com"), null);
    assert.equal(normalizeEmail("@acme.com"), null);
  });

  it("rejects more than one @", () => {
    assert.equal(normalizeEmail("jane@doe@acme.com"), null);
  });

  it("rejects a single-label or IP domain", () => {
    assert.equal(normalizeEmail("jane@localhost"), null);
    assert.equal(normalizeEmail("jane@192.168.0.1"), null);
  });

  it("rejects spaces inside the address", () => {
    assert.equal(normalizeEmail("jane doe@acme.com"), null);
    assert.equal(normalizeEmail("jane@acme .com"), null);
  });

  it("returns null for empty, null, and undefined input", () => {
    assert.equal(normalizeEmail(""), null);
    assert.equal(normalizeEmail("   "), null);
    assert.equal(normalizeEmail(null), null);
    assert.equal(normalizeEmail(undefined), null);
  });
});

describe("normalizeDomain", () => {
  it("reduces a full URL to its lowercase host without www.", () => {
    assert.equal(normalizeDomain("https://www.Acme.com/about?x=1"), "acme.com");
  });

  it("keeps a bare domain, trimming whitespace around it", () => {
    assert.equal(normalizeDomain("acme.com"), "acme.com");
    assert.equal(normalizeDomain("  acme.com "), "acme.com");
  });

  it("keeps subdomains other than www", () => {
    assert.equal(normalizeDomain("app.acme.com"), "app.acme.com");
  });

  it("drops a port and a trailing dot", () => {
    assert.equal(normalizeDomain("https://acme.com:8443/login"), "acme.com");
    assert.equal(normalizeDomain("acme.com."), "acme.com");
  });

  it("accepts a protocol-relative URL", () => {
    assert.equal(normalizeDomain("//acme.com/about"), "acme.com");
  });

  it("rejects an email address", () => {
    assert.equal(normalizeDomain("jane@acme.com"), null);
  });

  it("rejects LinkedIn, including country subdomains", () => {
    assert.equal(normalizeDomain("linkedin.com/in/jane"), null);
    assert.equal(normalizeDomain("https://uk.linkedin.com/in/jane"), null);
  });

  it("rejects whitespace inside the value", () => {
    assert.equal(normalizeDomain("acme .com"), null);
  });

  it("rejects IP addresses and single-label hosts", () => {
    assert.equal(normalizeDomain("http://192.168.0.1/admin"), null);
    assert.equal(normalizeDomain("localhost"), null);
    assert.equal(normalizeDomain("http://localhost:3000"), null);
  });

  it("returns null for empty, null, and undefined input", () => {
    assert.equal(normalizeDomain(""), null);
    assert.equal(normalizeDomain(null), null);
    assert.equal(normalizeDomain(undefined), null);
  });
});

describe("companyDomainFromEmail", () => {
  it("returns the domain of a work address", () => {
    assert.equal(companyDomainFromEmail("jane@acme.com"), "acme.com");
  });

  it("lowercases the domain and unwraps the address first", () => {
    assert.equal(companyDomainFromEmail("Jane Doe <Jane@ACME.com>"), "acme.com");
  });

  it("strips www. so it matches the company's website domain", () => {
    assert.equal(companyDomainFromEmail("jane@www.acme.com"), "acme.com");
  });

  it("returns null for a personal mailbox", () => {
    assert.equal(companyDomainFromEmail("jane@gmail.com"), null);
    assert.equal(companyDomainFromEmail("jane@Outlook.com"), null);
  });

  it("treats a LinkedIn address as working at LinkedIn", () => {
    assert.equal(companyDomainFromEmail("jane@linkedin.com"), "linkedin.com");
  });

  it("returns null for an invalid or missing address", () => {
    assert.equal(companyDomainFromEmail("jane at acme"), null);
    assert.equal(companyDomainFromEmail(null), null);
  });
});

describe("isPersonalEmailDomain", () => {
  it("recognizes webmail providers", () => {
    assert.equal(isPersonalEmailDomain("gmail.com"), true);
    assert.equal(isPersonalEmailDomain("proton.me"), true);
  });

  it("ignores case, surrounding whitespace, and a trailing dot", () => {
    assert.equal(isPersonalEmailDomain(" GMail.COM "), true);
    assert.equal(isPersonalEmailDomain("gmail.com."), true);
  });

  it("returns false for company domains, LinkedIn included", () => {
    assert.equal(isPersonalEmailDomain("acme.com"), false);
    assert.equal(isPersonalEmailDomain("linkedin.com"), false);
  });

  it("returns false for empty, null, and undefined input", () => {
    assert.equal(isPersonalEmailDomain(""), false);
    assert.equal(isPersonalEmailDomain(null), false);
    assert.equal(isPersonalEmailDomain(undefined), false);
  });
});

describe("normalizeUrl", () => {
  it("adds https:// to a bare domain", () => {
    assert.equal(normalizeUrl("acme.com"), "https://acme.com");
    assert.equal(normalizeUrl("//acme.com/about"), "https://acme.com/about");
  });

  it("keeps an http:// URL as http", () => {
    assert.equal(normalizeUrl("http://acme.com"), "http://acme.com");
  });

  it("keeps the path and query", () => {
    assert.equal(normalizeUrl("acme.com/pricing?plan=pro"), "https://acme.com/pricing?plan=pro");
  });

  it("drops the trailing slash only for a bare root", () => {
    assert.equal(normalizeUrl("https://acme.com/"), "https://acme.com");
    assert.equal(normalizeUrl("https://acme.com/about/"), "https://acme.com/about/");
    assert.equal(normalizeUrl("https://acme.com/?ref=x"), "https://acme.com/?ref=x");
    assert.equal(normalizeUrl("https://acme.com/#team"), "https://acme.com/#team");
  });

  it("rejects links that aren't http or https", () => {
    assert.equal(normalizeUrl("ftp://acme.com/file"), null);
    assert.equal(normalizeUrl("javascript:alert(1)"), null);
    assert.equal(normalizeUrl("mailto:jane@acme.com"), null);
  });

  it("rejects an email address, which would parse as credentials", () => {
    assert.equal(normalizeUrl("jane@acme.com"), null);
  });

  it("rejects single-label hosts and whitespace inside the value", () => {
    assert.equal(normalizeUrl("localhost"), null);
    assert.equal(normalizeUrl("acme .com"), null);
  });

  it("returns null for empty, null, and undefined input", () => {
    assert.equal(normalizeUrl(" "), null);
    assert.equal(normalizeUrl(null), null);
    assert.equal(normalizeUrl(undefined), null);
  });
});

describe("normalizeName", () => {
  it("trims and collapses whitespace but keeps case", () => {
    assert.equal(normalizeName("  Jane \n\t DOE "), "Jane DOE");
  });

  it("composes accents (NFC)", () => {
    assert.equal(normalizeName("Café"), "Café");
  });

  it("returns null for blank, null, and undefined input", () => {
    assert.equal(normalizeName(" \n "), null);
    assert.equal(normalizeName(null), null);
    assert.equal(normalizeName(undefined), null);
  });
});

describe("nameKey", () => {
  it("case-folds a normalized name", () => {
    assert.equal(nameKey("  Jane   DOE "), "jane doe");
  });

  it("gives composed and decomposed accents the same key", () => {
    assert.equal(nameKey("CAFÉ"), nameKey("Café"));
  });

  it("returns null for blank, null, and undefined input", () => {
    assert.equal(nameKey(""), null);
    assert.equal(nameKey(null), null);
    assert.equal(nameKey(undefined), null);
  });
});

describe("companyNameFromDomain", () => {
  it("capitalizes the registered name", () => {
    assert.equal(companyNameFromDomain("acme.com"), "Acme");
    assert.equal(companyNameFromDomain("linear.app"), "Linear");
  });

  it("skips a generic second level", () => {
    assert.equal(companyNameFromDomain("acme.co.uk"), "Acme");
    assert.equal(companyNameFromDomain("acme.com.au"), "Acme");
  });

  it("skips subdomains", () => {
    assert.equal(companyNameFromDomain("app.acme.com"), "Acme");
  });

  it("turns hyphens into words", () => {
    assert.equal(companyNameFromDomain("my-company.io"), "My Company");
  });

  it("accepts a URL or mixed case", () => {
    assert.equal(companyNameFromDomain("https://www.ACME.com/about"), "Acme");
  });

  it("capitalizes a single label", () => {
    assert.equal(companyNameFromDomain("acme"), "Acme");
  });

  it("returns an empty string for an empty domain", () => {
    assert.equal(companyNameFromDomain(""), "");
  });
});
