import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clean,
  companyFields,
  companyKeys,
  dealValue,
  isMentioned,
  leadPatch,
  mentionedHosts,
  missing,
  personFields,
  personKey,
  type CompanyFields,
  type PersonFields,
} from "~/lib/extraction-mapping";
// Type-only: the agent module builds a Mastra agent when it loads.
import type { Extraction } from "~/server/mastra/extraction-agent.server";

// Hand-built extractions. Every field the model may leave out starts as null.

type PersonInput = NonNullable<Extraction["person"]>;
type CompanyInput = NonNullable<Extraction["company"]>;

function person(fields: Partial<PersonInput>): PersonInput {
  return { name: null, email: null, title: null, profileUrl: null, ...fields };
}

function company(fields: Partial<CompanyInput>): CompanyInput {
  return { name: null, domain: null, website: null, ...fields };
}

function extraction(parts: {
  lead?: Partial<Extraction["lead"]>;
  person?: PersonInput;
  company?: CompanyInput;
} = {}): Extraction {
  return {
    inputKind: "notes",
    lead: { title: "", stage: null, value: null, summary: null, nextStep: null, ...parts.lead },
    person: parts.person ?? null,
    company: parts.company ?? null,
  };
}

// A lead as it is created: no title yet, the default stage, nothing linked.
const newLead = {
  title: "",
  stage: "new",
  value: null,
  summary: null,
  nextStep: null,
  personId: null,
  companyId: null,
} as const;

const noLinks = { personId: null, companyId: null };

describe("companyFields", () => {
  it("normalizes a stated name and domain, and builds the website from the domain", () => {
    const fields = companyFields(
      extraction({ company: company({ name: " Acme  Inc ", domain: "Acme.com" }) }),
      "Acme Inc (acme.com) wants a pilot",
    );
    assert.deepEqual(fields, { name: "Acme Inc", domain: "acme.com", website: "https://acme.com" });
  });

  it("takes the domain from the website and keeps the website's URL", () => {
    const fields = companyFields(
      extraction({ company: company({ name: "Linear", website: "linear.app/pricing" }) }),
      "Asked about linear.app/pricing",
    );
    assert.deepEqual(fields, { name: "Linear", domain: "linear.app", website: "https://linear.app/pricing" });
  });

  it("falls back to the domain of a work email", () => {
    const fields = companyFields(extraction({ person: person({ email: "Jane@Acme.com" }) }), "Jane@Acme.com");
    assert.deepEqual(fields, { name: "Acme", domain: "acme.com", website: "https://acme.com" });
  });

  it("prefers the company's own domain over the email's", () => {
    const fields = companyFields(extraction({
      company: company({ domain: "acme.com" }),
      person: person({ email: "jane@acme-mail.com" }),
    }), "jane@acme-mail.com, see acme.com");
    assert.equal(fields?.domain, "acme.com");
  });

  it("never makes a company from a personal email", () => {
    assert.equal(companyFields(
      extraction({ person: person({ name: "Jane", email: "jane@gmail.com" }) }),
      "Jane, jane@gmail.com",
    ), null);
  });

  it("ignores a personal email provider given as the company domain", () => {
    const fields = companyFields(extraction({
      company: company({ domain: "gmail.com" }),
      person: person({ email: "jane@acme.com" }),
    }), "jane@acme.com, also jane@gmail.com");
    assert.equal(fields?.domain, "acme.com");
  });

  it("doesn't treat a LinkedIn URL as the company's website", () => {
    const fields = companyFields(extraction({
      company: company({ name: "Acme", website: "https://www.linkedin.com/company/acme" }),
    }), "https://www.linkedin.com/company/acme");
    assert.deepEqual(fields, { name: "Acme", domain: null, website: null });
  });

  it("keeps a name-only company without a domain or website", () => {
    const fields = companyFields(extraction({ company: company({ name: "Acme" }) }), "Met Jane from Acme");
    assert.deepEqual(fields, { name: "Acme", domain: null, website: null });
  });

  it("names a company after its domain when no name is given", () => {
    const fields = companyFields(extraction({ company: company({ domain: "my-company.io" }) }), "my-company.io");
    assert.equal(fields?.name, "My Company");
  });

  it("returns null when nothing identifies a company", () => {
    assert.equal(companyFields(extraction(), "Some notes"), null);
    assert.equal(companyFields(
      extraction({ company: company({ name: "  ", domain: "not a domain" }) }),
      "not a domain",
    ), null);
  });

  // The model recalls domains for well-known names. Only the input counts.
  describe("keeps only domains the raw input names", () => {
    const karri = "Karri Saarinen, co-founder and CEO at Linear. Met at a design meetup; wants to talk about our API.";

    it("drops a recalled domain and website when the input has no URL", () => {
      const fields = companyFields(extraction({
        company: company({ name: "Linear", domain: "linear.io", website: "https://linear.app" }),
        person: person({ name: "Karri Saarinen", title: "Co-founder and CEO" }),
      }), karri);
      assert.deepEqual(fields, { name: "Linear", domain: null, website: null });
    });

    it("keeps the domain when the input links the company's site", () => {
      const fields = companyFields(extraction({
        company: company({ name: "Linear", domain: "linear.app", website: "https://linear.app/about" }),
      }), `${karri} https://linear.app/about`);
      assert.deepEqual(fields, { name: "Linear", domain: "linear.app", website: "https://linear.app/about" });
    });

    it("keeps the domain when the input gives a work email at it", () => {
      const fields = companyFields(extraction({
        company: company({ name: "Linear", domain: "linear.app" }),
        person: person({ name: "Karri Saarinen", email: "karri@linear.app" }),
      }), `${karri} Email: karri@linear.app`);
      assert.deepEqual(fields, { name: "Linear", domain: "linear.app", website: "https://linear.app" });
    });

    it("drops a stated domain that disagrees with the input, falling back to the email's", () => {
      const fields = companyFields(extraction({
        company: company({ name: "Linear", domain: "linear.io" }),
        person: person({ email: "karri@linear.app" }),
      }), "karri@linear.app");
      assert.deepEqual(fields, { name: "Linear", domain: "linear.app", website: "https://linear.app" });
    });

    it("still gives no company domain for a personal email the input names", () => {
      const fields = companyFields(extraction({
        company: company({ name: "Linear", domain: "linear.app" }),
        person: person({ email: "karri@gmail.com" }),
      }), "Karri from Linear, karri@gmail.com");
      assert.deepEqual(fields, { name: "Linear", domain: null, website: null });
    });

    it("still derives the name from a domain the input names", () => {
      const fields = companyFields(extraction({ company: company({ website: "https://usefathom.com" }) }), "Try usefathom.com");
      assert.deepEqual(fields, { name: "Usefathom", domain: "usefathom.com", website: "https://usefathom.com" });
    });

    it("makes no company from a recalled domain alone", () => {
      assert.equal(companyFields(extraction({ company: company({ domain: "linear.io" }) }), "Karri, CEO"), null);
    });

    it("matches the input case-insensitively, with or without www. and trailing punctuation", () => {
      const domain = (rawText: string) =>
        companyFields(extraction({ company: company({ name: "Acme", domain: "acme.com" }) }), rawText)?.domain;
      assert.equal(domain("Visit WWW.ACME.COM."), "acme.com");
      assert.equal(domain("(https://Acme.com/team)"), "acme.com");
      assert.equal(domain("<jane@acme.com>"), "acme.com");
    });

    it("accepts the company's domain when the input names one of its subdomains", () => {
      const fields = companyFields(
        extraction({ company: company({ name: "Cloudflare", domain: "cloudflare.com" }) }),
        "Dane Knecht, see https://blog.cloudflare.com/author/dane/",
      );
      assert.equal(fields?.domain, "cloudflare.com");
    });

    it("refuses a host the input names only as part of a longer one", () => {
      const domain = (stated: string, rawText: string) =>
        companyFields(extraction({ company: company({ name: "Acme", domain: stated }) }), rawText)?.domain ?? null;
      assert.equal(domain("acme.com", "acme.com.au"), null);
      assert.equal(domain("acme.com", "myacme.com"), null);
      assert.equal(domain("app.acme.com", "acme.com"), null);
      assert.equal(domain("acme.com", "Acme makes acme com widgets"), null);
    });
  });
});

describe("mentionedHosts", () => {
  it("collects hosts from URLs, bare domains and email addresses", () => {
    assert.deepEqual(
      [...mentionedHosts("See https://www.Linear.app/about, karri@linear.app and vercel.com.")].sort(),
      ["linear.app", "vercel.com"],
    );
  });

  it("skips LinkedIn, IP addresses and dotted abbreviations", () => {
    assert.deepEqual([...mentionedHosts("linkedin.com/in/karri, 10.0.0.1, e.g. v1.2.3")], []);
  });

  it("returns nothing for text without hosts", () => {
    assert.equal(mentionedHosts("").size, 0);
    assert.equal(mentionedHosts("Karri Saarinen, CEO at Linear").size, 0);
  });
});

describe("isMentioned", () => {
  const hosts = new Set(["blog.cloudflare.com", "acme.com"]);

  it("matches a named host or a subdomain of the domain", () => {
    assert.equal(isMentioned("acme.com", hosts), true);
    assert.equal(isMentioned("cloudflare.com", hosts), true);
  });

  it("doesn't match on a partial label or an unnamed subdomain", () => {
    assert.equal(isMentioned("flare.com", hosts), false);
    assert.equal(isMentioned("app.acme.com", hosts), false);
  });
});

describe("companyKeys", () => {
  const acme: CompanyFields = { name: "Acme  INC", domain: "acme.com", website: "https://acme.com" };

  it("tries the domain first, then a same-name company that has no domain yet", () => {
    assert.deepEqual(companyKeys(acme), [
      { by: "domain", domain: "acme.com" },
      { by: "name", name: "acme inc", withoutDomain: true },
    ]);
  });

  it("matches any same-name company when the extraction has no domain", () => {
    assert.deepEqual(companyKeys({ name: "Acme", domain: null, website: null }), [
      { by: "name", name: "acme", withoutDomain: false },
    ]);
  });

  it("matches names regardless of how accents are encoded", () => {
    const composed = companyKeys({ name: "Café Ltd", domain: null, website: null });
    const decomposed = companyKeys({ name: "Café Ltd", domain: null, website: null });
    assert.deepEqual(composed, decomposed);
  });

  it("returns only the domain key when the name is blank", () => {
    assert.deepEqual(companyKeys({ name: " ", domain: "acme.com", website: null }), [
      { by: "domain", domain: "acme.com" },
    ]);
  });
});

describe("personFields", () => {
  it("normalizes every field", () => {
    const fields = personFields(extraction({
      person: person({
        name: " Jane   Doe ",
        email: "Jane Doe <Jane@Acme.com>",
        title: " CTO ",
        profileUrl: "linkedin.com/in/jane",
      }),
    }));
    assert.deepEqual(fields, {
      name: "Jane Doe",
      email: "jane@acme.com",
      title: "CTO",
      profileUrl: "https://linkedin.com/in/jane",
    });
  });

  it("keeps a person known only by email", () => {
    assert.deepEqual(personFields(extraction({ person: person({ email: "jane@acme.com" }) })), {
      name: null,
      email: "jane@acme.com",
      title: null,
      profileUrl: null,
    });
  });

  it("drops an invalid email but keeps the named person", () => {
    const fields = personFields(extraction({ person: person({ name: "Jane", email: "jane at acme" }) }));
    assert.equal(fields?.name, "Jane");
    assert.equal(fields?.email, null);
  });

  it("drops a profile URL that isn't a web link", () => {
    const fields = personFields(extraction({ person: person({ name: "Jane", profileUrl: "javascript:alert(1)" }) }));
    assert.equal(fields?.profileUrl, null);
  });

  it("returns null without a name or a valid email", () => {
    assert.equal(personFields(extraction()), null);
    assert.equal(personFields(extraction({ person: person({ title: "CTO", email: "not-an-email" }) })), null);
  });
});

describe("personKey", () => {
  const jane: PersonFields = { name: "Jane  DOE", email: "jane@acme.com", title: null, profileUrl: null };

  it("matches by email first, even with a name and a company", () => {
    assert.deepEqual(personKey(jane, "company-1"), { by: "email", email: "jane@acme.com" });
  });

  it("matches by case-folded name within the company when there is no email", () => {
    assert.deepEqual(personKey({ ...jane, email: null }, "company-1"), {
      by: "name",
      name: "jane doe",
      companyId: "company-1",
    });
  });

  it("never matches a bare name without a company", () => {
    assert.equal(personKey({ ...jane, email: null }, null), null);
  });

  it("returns null with neither a name nor an email", () => {
    assert.equal(personKey({ ...jane, name: null, email: null }, "company-1"), null);
  });
});

describe("leadPatch", () => {
  const links = { personId: "person-1", companyId: "company-1" };

  it("fills a new lead from the extraction and the linked records", () => {
    const patch = leadPatch(newLead, extraction({
      lead: { title: " Acme — pilot ", stage: "qualified", value: 50_000, summary: " Wants a pilot. ", nextStep: "Call Jane" },
    }), links);
    assert.deepEqual(patch, {
      title: "Acme — pilot",
      stage: "qualified",
      value: 50_000,
      summary: "Wants a pilot.",
      nextStep: "Call Jane",
      personId: "person-1",
      companyId: "company-1",
    });
  });

  it("keeps a title the user already typed", () => {
    const patch = leadPatch({ ...newLead, title: "My deal" }, extraction({ lead: { title: "Acme — pilot" } }), noLinks);
    assert.equal("title" in patch, false);
  });

  it("doesn't set a blank title", () => {
    assert.deepEqual(leadPatch(newLead, extraction({ lead: { title: "   " } }), noLinks), {});
  });

  it("keeps a stage the user already moved", () => {
    const patch = leadPatch({ ...newLead, stage: "contacted" }, extraction({ lead: { stage: "won" } }), noLinks);
    assert.equal("stage" in patch, false);
  });

  it("leaves the stage alone when the extraction doesn't state one", () => {
    assert.equal("stage" in leadPatch(newLead, extraction(), noLinks), false);
  });

  it("only fills gaps, never overwriting earlier values or links", () => {
    const lead = {
      ...newLead,
      value: 10,
      summary: "Earlier summary",
      nextStep: "Earlier step",
      personId: "person-0",
      companyId: "company-0",
    };
    const patch = leadPatch(lead, extraction({
      lead: { value: 50_000, summary: "New summary", nextStep: "New step" },
    }), links);
    assert.deepEqual(patch, {});
  });

  it("skips a deal value the column can't hold", () => {
    assert.equal("value" in leadPatch(newLead, extraction({ lead: { value: -5 } }), noLinks), false);
    assert.equal("value" in leadPatch(newLead, extraction({ lead: { value: 3e9 } }), noLinks), false);
  });

  it("skips blank summaries and next steps", () => {
    assert.deepEqual(leadPatch(newLead, extraction({ lead: { summary: " ", nextStep: "" } }), noLinks), {});
  });
});

describe("missing", () => {
  it("keeps only the values whose columns are empty", () => {
    const row = { summary: "Set", nextStep: null as string | null };
    assert.deepEqual(missing(row, { summary: "New", nextStep: "Call" }), { nextStep: "Call" });
  });

  it("treats undefined columns as empty", () => {
    const row: { summary?: string } = {};
    assert.deepEqual(missing(row, { summary: "New" }), { summary: "New" });
  });

  it("ignores null and undefined values", () => {
    const row = { summary: null as string | null, nextStep: null as string | null };
    assert.deepEqual(missing(row, { summary: null, nextStep: undefined }), {});
  });

  it("treats zero and the empty string as set, both on the row and as values", () => {
    assert.deepEqual(missing({ value: 0 as number | null }, { value: 5 }), {});
    assert.deepEqual(missing({ summary: "" as string | null }, { summary: "New" }), {});
    assert.deepEqual(missing({ value: null as number | null }, { value: 0 }), { value: 0 });
  });

  it("doesn't change the row", () => {
    const row = { summary: null as string | null };
    missing(row, { summary: "New" });
    assert.deepEqual(row, { summary: null });
  });
});

describe("clean", () => {
  it("trims surrounding whitespace and keeps inner spacing", () => {
    assert.equal(clean("  Call  Jane \n"), "Call  Jane");
  });

  it("turns blank text into null", () => {
    assert.equal(clean(""), null);
    assert.equal(clean(" \t\n "), null);
  });

  it("passes null and undefined through as null", () => {
    assert.equal(clean(null), null);
    assert.equal(clean(undefined), null);
  });
});

describe("dealValue", () => {
  it("keeps whole, non-negative dollar amounts, including zero", () => {
    assert.equal(dealValue(50_000), 50_000);
    assert.equal(dealValue(0), 0);
  });

  it("keeps the largest value an integer column holds and rejects anything above", () => {
    assert.equal(dealValue(2_147_483_647), 2_147_483_647);
    assert.equal(dealValue(2_147_483_648), null);
  });

  it("rejects negative and fractional amounts", () => {
    assert.equal(dealValue(-1), null);
    assert.equal(dealValue(99.5), null);
  });

  it("rejects NaN and infinity", () => {
    assert.equal(dealValue(Number.NaN), null);
    assert.equal(dealValue(Number.POSITIVE_INFINITY), null);
  });

  it("passes null through", () => {
    assert.equal(dealValue(null), null);
  });
});
