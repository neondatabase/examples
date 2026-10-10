import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Company, Lead, Person, SubjectType } from "~/db/schema";
import { FINDING_LABELS, MAX_LENGTHS, SENIORITIES, SIZE_BANDS, type FindingLabel } from "~/lib/constants";
import {
  agentColumnValues,
  derivedCompanyValues,
  fillableColumns,
  fillableCompanyColumns,
  findingColumns,
  isFindingLabel,
  isMultiValuedFinding,
  namedColumn,
  normalizeConfidence,
  normalizeFindingValue,
  normalizeSourceUrl,
} from "~/lib/finding-mapping";

function valueOf(subject: SubjectType, label: FindingLabel, raw: string): string {
  const result = normalizeFindingValue(subject, label, raw);
  assert.ok(result.ok, `${subject}.${label} "${raw}" was rejected: ${result.ok ? "" : result.message}`);
  return result.value;
}

function rejects(subject: SubjectType, label: FindingLabel, raw: string, pattern?: RegExp): void {
  const result = normalizeFindingValue(subject, label, raw);
  assert.equal(result.ok, false, `${subject}.${label} "${raw}" was accepted`);
  if (pattern && !result.ok) assert.match(result.message, pattern);
}

const longer = (max: number) => "x".repeat(max + 1);

describe("normalizeFindingValue", () => {
  it("rejects a label that belongs to another subject", () => {
    rejects("person", "domain", "acme.com", /isn't a person label/);
    rejects("lead", "title", "VP", /isn't a lead label/);
    rejects("company", "avatar_url", "https://acme.com/a.png");
  });

  describe("company", () => {
    it("name: collapses whitespace and caps the length", () => {
      assert.equal(valueOf("company", "name", "  Fathom   Analytics "), "Fathom Analytics");
      rejects("company", "name", "   ", /empty/);
      rejects("company", "name", longer(MAX_LENGTHS.field), /at most 500/);
    });

    it("domain: normalizes URLs and hosts to a bare domain", () => {
      assert.equal(valueOf("company", "domain", "acme.com"), "acme.com");
      assert.equal(valueOf("company", "domain", "https://www.Acme.com/about?x=1"), "acme.com");
      assert.equal(valueOf("company", "domain", "ACME.co.uk."), "acme.co.uk");
    });

    it("domain: rejects personal mail providers, emails, and non-domains", () => {
      rejects("company", "domain", "gmail.com", /personal email provider/);
      rejects("company", "domain", "https://www.outlook.com", /personal email provider/);
      rejects("company", "domain", "jane@acme.com", /bare domain/);
      rejects("company", "domain", "Acme Inc", /bare domain/);
      rejects("company", "domain", "linkedin.com/company/acme", /bare domain/);
    });

    it("description, industry, hq_location, funding: free text with the field cap", () => {
      for (const label of ["description", "industry", "hq_location", "funding"] as const) {
        assert.equal(valueOf("company", label, " Some\n text "), "Some text");
        rejects("company", label, longer(MAX_LENGTHS.field), /at most/);
        rejects("company", label, "Unknown", /isn't a fact/);
        rejects("company", label, "N/A", /isn't a fact/);
      }
      assert.equal(valueOf("company", "funding", "Series B, $40M total (2024)"), "Series B, $40M total (2024)");
      assert.equal(valueOf("company", "hq_location", "San Francisco, CA, USA"), "San Francisco, CA, USA");
    });

    it("size_band: one of the bands, tolerating spaces, dashes and commas", () => {
      for (const band of SIZE_BANDS) assert.equal(valueOf("company", "size_band", band), band);
      assert.equal(valueOf("company", "size_band", " 51 – 200 "), "51-200");
      assert.equal(valueOf("company", "size_band", "10,001+"), "10001+");
      rejects("company", "size_band", "50-200", /one of "1-10"/);
      rejects("company", "size_band", "about 40", /one of/);
    });

    it("founded_year: a four-digit year in range", () => {
      const thisYear = new Date().getUTCFullYear();
      assert.equal(valueOf("company", "founded_year", " 2015 "), "2015");
      assert.equal(valueOf("company", "founded_year", String(thisYear)), String(thisYear));
      rejects("company", "founded_year", String(thisYear + 1), /no later than/);
      rejects("company", "founded_year", "0999");
      rejects("company", "founded_year", "15");
      rejects("company", "founded_year", "2015-01-01");
      rejects("company", "founded_year", "c. 2015");
    });

    it("logo_url and social_links: absolute http(s) URLs only", () => {
      assert.equal(valueOf("company", "logo_url", "https://Acme.com/apple-touch-icon.png"), "https://acme.com/apple-touch-icon.png");
      assert.equal(valueOf("company", "social_links", "https://x.com/acme"), "https://x.com/acme");
      assert.equal(valueOf("company", "social_links", "http://github.com/acme/"), "http://github.com/acme/");
      for (const label of ["logo_url", "social_links"] as const) {
        rejects("company", label, "acme.com/logo.png", /absolute http\(s\) URL/);
        rejects("company", label, "javascript:alert(1)", /absolute http\(s\) URL/);
        rejects("company", label, "data:image/png;base64,AAAA", /absolute http\(s\) URL/);
        rejects("company", label, "ftp://acme.com/logo.png", /absolute http\(s\) URL/);
      }
    });

    it("logo_url allows long CDN URLs; social_links keeps the field cap", () => {
      const long = `https://cdn.acme.com/${"a".repeat(800)}.png`;
      assert.equal(valueOf("company", "logo_url", long), long);
      rejects("company", "social_links", long, /at most 500/);
      rejects("company", "logo_url", `https://cdn.acme.com/${"a".repeat(MAX_LENGTHS.url)}`, /at most 2000/);
    });

    it("recent_news: \"YYYY-MM: headline\"", () => {
      assert.equal(valueOf("company", "recent_news", "2025-03: Raised a $40M Series B"), "2025-03: Raised a $40M Series B");
      assert.equal(valueOf("company", "recent_news", "2025-03-14 :  Raised  a Series B"), "2025-03: Raised a Series B");
      rejects("company", "recent_news", "Raised a Series B", /YYYY-MM: headline/);
      rejects("company", "recent_news", "2025-13: Bad month", /YYYY-MM: headline/);
      rejects("company", "recent_news", "2025-03:", /YYYY-MM: headline/);
      rejects("company", "recent_news", `2025-03: ${longer(MAX_LENGTHS.field)}`, /at most/);
    });
  });

  describe("person", () => {
    it("name and title: free text with the field cap", () => {
      assert.equal(valueOf("person", "name", "  Zeno  Rocha "), "Zeno Rocha");
      assert.equal(valueOf("person", "title", "VP Engineering"), "VP Engineering");
      rejects("person", "title", longer(MAX_LENGTHS.field), /at most 500/);
      rejects("person", "title", "unknown", /isn't a fact/);
    });

    it("seniority: one of the levels, tolerating case, spaces and hyphens", () => {
      for (const level of SENIORITIES) assert.equal(valueOf("person", "seniority", level), level);
      assert.equal(valueOf("person", "seniority", "C-Level"), "c_level");
      assert.equal(valueOf("person", "seniority", "Individual Contributor"), "individual_contributor");
      assert.equal(valueOf("person", "seniority", " VP "), "vp");
      rejects("person", "seniority", "senior", /one of "founder"/);
    });

    it("public_profiles and avatar_url: absolute http(s) URLs only", () => {
      assert.equal(valueOf("person", "public_profiles", "https://github.com/zenorocha"), "https://github.com/zenorocha");
      assert.equal(
        valueOf("person", "avatar_url", "https://pbs.twimg.com/profile_images/1/a_400x400.jpg"),
        "https://pbs.twimg.com/profile_images/1/a_400x400.jpg",
      );
      rejects("person", "public_profiles", "github.com/zenorocha", /absolute http\(s\) URL/);
      rejects("person", "avatar_url", "data:image/png;base64,AAAA", /absolute http\(s\) URL/);
      rejects("person", "public_profiles", `https://example.com/${"a".repeat(MAX_LENGTHS.field)}`, /at most 500/);
    });
  });

  describe("X links", () => {
    it("map twitter.com and its www. and mobile. hosts to x.com, keeping the path", () => {
      for (const [subject, label] of [["company", "social_links"], ["person", "public_profiles"]] as const) {
        assert.equal(valueOf(subject, label, "https://twitter.com/zenorocha"), "https://x.com/zenorocha");
        assert.equal(valueOf(subject, label, "http://www.twitter.com/ZenoRocha/"), "https://x.com/ZenoRocha/");
        assert.equal(valueOf(subject, label, "https://mobile.twitter.com/resend?s=20"), "https://x.com/resend?s=20");
        assert.equal(valueOf(subject, label, "https://www.x.com/resend"), "https://x.com/resend");
        assert.equal(valueOf(subject, label, "https://x.com/resend"), "https://x.com/resend");
      }
    });

    it("leave other hosts and image URLs alone", () => {
      assert.equal(valueOf("company", "social_links", "https://nottwitter.com/acme"), "https://nottwitter.com/acme");
      assert.equal(valueOf("company", "social_links", "https://blog.twitter.com/acme"), "https://blog.twitter.com/acme");
      // Image URLs are checked as given, before normalizing, so they're never rewritten.
      assert.equal(valueOf("person", "avatar_url", "https://twitter.com/zeno/photo.jpg"), "https://twitter.com/zeno/photo.jpg");
      assert.equal(valueOf("company", "logo_url", "https://twitter.com/acme/logo.png"), "https://twitter.com/acme/logo.png");
    });
  });

  describe("lead", () => {
    it("fit_score: an integer 0–100, stored as a 0–1 decimal string", () => {
      assert.equal(valueOf("lead", "fit_score", "72"), "0.72");
      assert.equal(valueOf("lead", "fit_score", "7"), "0.07");
      assert.equal(valueOf("lead", "fit_score", "0"), "0.00");
      assert.equal(valueOf("lead", "fit_score", "100"), "1.00");
      assert.equal(valueOf("lead", "fit_score", " 85% "), "0.85");
      for (let score = 0; score <= 100; score += 1) {
        assert.equal(Number(valueOf("lead", "fit_score", String(score))), score / 100);
      }
      rejects("lead", "fit_score", "0.72", /integer from 0 to 100/);
      rejects("lead", "fit_score", "101", /integer from 0 to 100/);
      rejects("lead", "fit_score", "-5", /integer from 0 to 100/);
      rejects("lead", "fit_score", "high", /integer from 0 to 100/);
    });

    it("next_step: free text with the next-step cap", () => {
      assert.equal(valueOf("lead", "next_step", "Book a pilot call."), "Book a pilot call.");
      assert.equal(valueOf("lead", "next_step", "x".repeat(MAX_LENGTHS.nextStep)), "x".repeat(MAX_LENGTHS.nextStep));
      rejects("lead", "next_step", longer(MAX_LENGTHS.nextStep), /at most 500/);
    });
  });

  it("has a rule for every label", () => {
    for (const subject of Object.keys(FINDING_LABELS) as SubjectType[]) {
      for (const label of FINDING_LABELS[subject]) {
        const result = normalizeFindingValue(subject, label, "");
        assert.equal(result.ok, false, `${subject}.${label} accepted an empty value`);
      }
    }
  });
});

describe("label helpers", () => {
  it("isFindingLabel checks the subject", () => {
    assert.equal(isFindingLabel("person", "avatar_url"), true);
    assert.equal(isFindingLabel("company", "avatar_url"), false);
    assert.equal(isFindingLabel("lead", "fit_score"), true);
  });

  it("isMultiValuedFinding", () => {
    assert.equal(isMultiValuedFinding("company", "social_links"), true);
    assert.equal(isMultiValuedFinding("company", "recent_news"), true);
    assert.equal(isMultiValuedFinding("person", "public_profiles"), true);
    assert.equal(isMultiValuedFinding("company", "domain"), false);
    assert.equal(isMultiValuedFinding("person", "avatar_url"), false);
  });

  it("normalizeSourceUrl keeps http(s) URLs and drops the rest", () => {
    assert.equal(normalizeSourceUrl(" https://Resend.com/about "), "https://resend.com/about");
    assert.equal(normalizeSourceUrl("resend.com/about"), null);
    assert.equal(normalizeSourceUrl("javascript:alert(1)"), null);
    assert.equal(normalizeSourceUrl(""), null);
    assert.equal(normalizeSourceUrl(undefined), null);
  });

  it("normalizeConfidence clamps to 0–1", () => {
    assert.equal(normalizeConfidence(0.8), 0.8);
    assert.equal(normalizeConfidence(1.5), 1);
    assert.equal(normalizeConfidence(-1), 0);
    assert.equal(normalizeConfidence(Number.NaN), null);
  });
});

describe("findingColumns", () => {
  it("maps every company label", () => {
    assert.deepEqual(findingColumns("company", "name", "Resend"), { table: "companies", patch: { name: "Resend" } });
    assert.deepEqual(findingColumns("company", "domain", "resend.com"), {
      table: "companies",
      patch: { domain: "resend.com", website: "https://resend.com" },
    });
    assert.deepEqual(findingColumns("company", "description", "Email API"), {
      table: "companies",
      patch: { description: "Email API" },
    });
    assert.deepEqual(findingColumns("company", "industry", "Software"), { table: "companies", patch: { industry: "Software" } });
    assert.deepEqual(findingColumns("company", "size_band", "11-50"), { table: "companies", patch: { sizeBand: "11-50" } });
    assert.deepEqual(findingColumns("company", "hq_location", "San Francisco, CA, USA"), {
      table: "companies",
      patch: { location: "San Francisco, CA, USA" },
    });
    assert.deepEqual(findingColumns("company", "founded_year", "2023"), { table: "companies", patch: { foundedYear: 2023 } });
    assert.deepEqual(findingColumns("company", "logo_url", "https://resend.com/icon.png"), {
      table: "companies",
      patch: { logoUrl: "https://resend.com/icon.png" },
    });
    assert.deepEqual(findingColumns("company", "funding", "Series A"), { table: "companies", patch: { funding: "Series A" } });
    assert.equal(findingColumns("company", "social_links", "https://x.com/resend"), null);
    assert.equal(findingColumns("company", "recent_news", "2025-03: Launch week"), null);
  });

  it("maps every person label", () => {
    assert.deepEqual(findingColumns("person", "name", "Zeno Rocha"), { table: "people", patch: { name: "Zeno Rocha" } });
    assert.deepEqual(findingColumns("person", "title", "CEO"), { table: "people", patch: { title: "CEO" } });
    assert.deepEqual(findingColumns("person", "seniority", "founder"), { table: "people", patch: { seniority: "founder" } });
    assert.deepEqual(findingColumns("person", "public_profiles", "https://github.com/zenorocha"), {
      table: "people",
      patch: { profileUrl: "https://github.com/zenorocha" },
    });
    assert.deepEqual(findingColumns("person", "avatar_url", "https://example.com/z.png"), {
      table: "people",
      patch: { avatarUrl: "https://example.com/z.png" },
    });
  });

  it("maps every lead label", () => {
    assert.deepEqual(findingColumns("lead", "fit_score", "0.72"), { table: "leads", patch: { fitScore: 0.72 } });
    assert.deepEqual(findingColumns("lead", "next_step", "Book a call."), { table: "leads", patch: { nextStep: "Book a call." } });
  });

  it("covers every label", () => {
    const findingOnly = new Set(["company.social_links", "company.recent_news"]);
    for (const subject of Object.keys(FINDING_LABELS) as SubjectType[]) {
      for (const label of FINDING_LABELS[subject]) {
        const columns = findingColumns(subject, label, "1");
        assert.equal(columns === null, findingOnly.has(`${subject}.${label}`), `${subject}.${label}`);
      }
    }
  });
});

describe("namedColumn", () => {
  it("is the column the label names, not one derived from it", () => {
    assert.equal(namedColumn("company", "domain"), "domain");
    assert.equal(namedColumn("company", "size_band"), "sizeBand");
    assert.equal(namedColumn("company", "hq_location"), "location");
    assert.equal(namedColumn("person", "public_profiles"), "profileUrl");
    assert.equal(namedColumn("person", "avatar_url"), "avatarUrl");
    assert.equal(namedColumn("lead", "fit_score"), "fitScore");
    assert.equal(namedColumn("company", "social_links"), null);
    assert.equal(namedColumn("company", "recent_news"), null);
  });

  it("is one of the label's columns for every label", () => {
    for (const subject of Object.keys(FINDING_LABELS) as SubjectType[]) {
      for (const label of FINDING_LABELS[subject]) {
        const columns = findingColumns(subject, label, "1");
        const named = namedColumn(subject, label);
        assert.equal(named === null, columns === null, `${subject}.${label}`);
        if (columns && named) assert.ok(named in columns.patch, `${subject}.${label}`);
      }
    }
  });
});

describe("agentColumnValues", () => {
  it("maps each latest single-valued finding to its columns", () => {
    assert.deepEqual(
      agentColumnValues("company", [
        { label: "domain", value: "acme.com" },
        { label: "founded_year", value: "2015" },
      ]),
      { domain: "acme.com", website: "https://acme.com", foundedYear: 2015 },
    );
    assert.deepEqual(agentColumnValues("lead", [{ label: "fit_score", value: "0.72" }]), { fitScore: 0.72 });
  });

  it("leaves out multi-valued and unknown labels", () => {
    assert.deepEqual(
      agentColumnValues("person", [
        { label: "public_profiles", value: "https://github.com/jane" },
        { label: "domain", value: "acme.com" },
        { label: "title", value: "CTO" },
      ]),
      { title: "CTO" },
    );
  });
});

describe("fillableColumns", () => {
  type PersonRow = Pick<Person, "name" | "title" | "seniority" | "profileUrl" | "avatarUrl">;
  const person = (fields: Partial<PersonRow>): PersonRow => ({
    name: null,
    title: null,
    seniority: null,
    profileUrl: null,
    avatarUrl: null,
    ...fields,
  });

  it("fills an empty column", () => {
    assert.deepEqual(fillableColumns(person({}), { title: "CTO" }, {}), { title: "CTO" });
    assert.deepEqual(fillableColumns(person({ title: "  " }), { title: "CTO" }, {}), { title: "CTO" });
  });

  it("overwrites the agent's own latest value", () => {
    assert.deepEqual(
      fillableColumns(person({ title: "VP Eng" }), { title: "CTO" }, { title: "VP Eng" }),
      { title: "CTO" },
    );
    // Whitespace differences don't hide the agent's own value.
    assert.deepEqual(
      fillableColumns(person({ title: "VP  Eng " }), { title: "CTO" }, { title: "VP Eng" }),
      { title: "CTO" },
    );
  });

  it("keeps a user's value", () => {
    // The agent last found "VP Eng"; the user corrected it to "VP Engineering".
    assert.deepEqual(
      fillableColumns(person({ title: "VP Engineering" }), { title: "CTO" }, { title: "VP Eng" }),
      {},
    );
    // Case counts as an edit.
    assert.deepEqual(fillableColumns(person({ title: "vp eng" }), { title: "CTO" }, { title: "VP Eng" }), {});
  });

  it("keeps an extraction value, which has no agent finding", () => {
    assert.deepEqual(fillableColumns(person({ title: "Head of Platform" }), { title: "CTO" }, {}), {});
    type LeadRow = Pick<Lead, "fitScore" | "nextStep">;
    const lead: LeadRow = { fitScore: null, nextStep: "Send pricing" };
    assert.deepEqual(
      fillableColumns(lead, { fitScore: 0.8, nextStep: "Book a pilot call." }, {}),
      { fitScore: 0.8 },
    );
  });

  it("drops a value that wouldn't change", () => {
    assert.deepEqual(fillableColumns(person({ title: "CTO" }), { title: "CTO" }, { title: "CTO" }), {});
    assert.deepEqual(fillableColumns(person({ title: "CTO " }), { title: "CTO" }, {}), {});
    // A repeat in other case isn't a change, even over the agent's own value.
    assert.deepEqual(fillableColumns(person({ title: "Fathom CTO" }), { title: "fathom cto" }, { title: "Fathom CTO" }), {});
    type CompanyRow = Pick<Company, "domain" | "website">;
    const company: CompanyRow = { domain: "acme.com", website: "https://acme.com" };
    assert.deepEqual(fillableColumns(company, { domain: "acme.com", website: "https://acme.com" }, {}), {});
  });

  it("compares numbers as numbers", () => {
    type CompanyRow = Pick<Company, "foundedYear">;
    const company: CompanyRow = { foundedYear: 2015 };
    // Unchanged, even though the agent value is text.
    assert.deepEqual(fillableColumns(company, { foundedYear: 2015 }, { foundedYear: "2015" }), {});
    // The agent's own year, read back as a number, may be replaced.
    assert.deepEqual(fillableColumns(company, { foundedYear: 2016 }, { foundedYear: "2015" }), { foundedYear: 2016 });
    // A `real` column reads back with single-precision rounding.
    type LeadRow = Pick<Lead, "fitScore">;
    const lead: LeadRow = { fitScore: Math.fround(0.72) };
    assert.deepEqual(fillableColumns(lead, { fitScore: 0.72 }, {}), {});
    assert.deepEqual(fillableColumns(lead, { fitScore: 0.9 }, { fitScore: 0.72 }), { fitScore: 0.9 });
    assert.deepEqual(fillableColumns(lead, { fitScore: 0.9 }, { fitScore: 0.5 }), {});
  });

  it("handles several columns independently", () => {
    type CompanyRow = Pick<Company, "domain" | "website">;
    // Extraction set the website from a URL in the input; the agent's domain fills only the domain.
    const company: CompanyRow = { domain: null, website: "https://acme.com/pricing" };
    assert.deepEqual(
      fillableColumns(company, { domain: "acme.com", website: "https://acme.com" }, {}),
      { domain: "acme.com" },
    );
  });

  it("ignores null and undefined patch values", () => {
    assert.deepEqual(fillableColumns(person({ title: "CTO" }), { title: null, name: undefined }, {}), {});
  });
});

describe("derivedCompanyValues", () => {
  it("offers a name extraction derived from the domain while an agent wrote the row last", () => {
    const company: Pick<Company, "name" | "domain" | "updatedBy"> = { name: "Usefathom", domain: "usefathom.com", updatedBy: "agent" };
    assert.deepEqual(derivedCompanyValues(company), { name: "Usefathom" });
    // So the real name can replace it.
    assert.deepEqual(
      fillableColumns(company, { name: "Fathom Analytics" }, derivedCompanyValues(company)),
      { name: "Fathom Analytics" },
    );
  });

  it("offers nothing after a user edit, for another name, or without a domain", () => {
    assert.deepEqual(derivedCompanyValues({ name: "Usefathom", domain: "usefathom.com", updatedBy: "user" }), {});
    assert.deepEqual(derivedCompanyValues({ name: "Fathom", domain: "usefathom.com", updatedBy: "agent" }), {});
    assert.deepEqual(derivedCompanyValues({ name: "Acme", domain: null, updatedBy: "agent" }), {});
  });
});

describe("fillableCompanyColumns", () => {
  type CompanyRow = Pick<Company, "name" | "domain" | "website" | "updatedBy">;
  const company = (fields: Partial<CompanyRow>): CompanyRow => ({
    name: "Acme",
    domain: null,
    website: null,
    updatedBy: "agent",
    ...fields,
  });
  const domainPatch = (domain: string) => {
    const columns = findingColumns("company", "domain", domain);
    assert.ok(columns?.table === "companies");
    return columns.patch;
  };

  it("fills a domain and its website together", () => {
    assert.deepEqual(fillableCompanyColumns(company({}), domainPatch("acme.com"), {}), {
      domain: "acme.com",
      website: "https://acme.com",
    });
  });

  it("doesn't fill the website from a domain the rule keeps out", () => {
    // The user typed the domain on a name-only company, so the website is empty.
    const row = company({ domain: "acme.com", updatedBy: "user" });
    assert.deepEqual(fillableCompanyColumns(row, domainPatch("acme.io"), {}), {});
  });

  it("fills an empty website when the row already holds the domain", () => {
    const row = company({ domain: "acme.com", updatedBy: "user" });
    assert.deepEqual(fillableCompanyColumns(row, domainPatch("acme.com"), {}), { website: "https://acme.com" });
  });

  it("replaces the agent's own domain and website", () => {
    const row = company({ domain: "acme.io", website: "https://acme.io" });
    const own = { domain: "acme.io", website: "https://acme.io" };
    assert.deepEqual(fillableCompanyColumns(row, domainPatch("acme.com"), own), {
      domain: "acme.com",
      website: "https://acme.com",
    });
  });

  it("keeps the derived-name exception, and the agent's own name wins over it", () => {
    const row = company({ name: "Usefathom", domain: "usefathom.com" });
    assert.deepEqual(fillableCompanyColumns(row, { name: "Fathom Analytics" }, {}), { name: "Fathom Analytics" });
    const user = company({ name: "Usefathom", domain: "usefathom.com", updatedBy: "user" });
    assert.deepEqual(fillableCompanyColumns(user, { name: "Fathom Analytics" }, {}), {});
  });
});

describe("the filled flag", () => {
  // Builds `agentValues` the way persist does: only from findings that wrote their column.
  type PersonRow = Pick<Person, "title">;
  const own = (findings: readonly { label: string; value: string; filled: boolean }[]) =>
    agentColumnValues("person", findings.filter((finding) => finding.filled));

  it("a finding that only repeats a user's value doesn't make it the agent's", () => {
    // Run 1 filled "Head of Eng"; the user corrected it to "CTO"; run 2 confirmed "CTO", writing nothing.
    const row: PersonRow = { title: "CTO" };
    const history = [
      { label: "title", value: "Head of Eng", filled: true },
      { label: "title", value: "CTO", filled: false },
    ];
    assert.deepEqual(fillableColumns(row, { title: "Co-founder" }, own(history)), {});
    // Counting the confirmation as the agent's own, as before, would replace the user's value.
    assert.deepEqual(fillableColumns(row, { title: "Co-founder" }, agentColumnValues("person", history)), {
      title: "Co-founder",
    });
  });

  it("the agent's own filled value is still replaceable", () => {
    const row: PersonRow = { title: "Head of Eng" };
    const history = [{ label: "title", value: "Head of Eng", filled: true }];
    assert.deepEqual(fillableColumns(row, { title: "CTO" }, own(history)), { title: "CTO" });
  });
});
