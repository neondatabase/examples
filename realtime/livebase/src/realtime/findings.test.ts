import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Finding } from "~/db/schema";
import { FINDING_LABELS } from "~/lib/constants";
import { compactUrl, findingDisplay, findingLabelName, visibleFindings } from "~/realtime/findings";

const PERSON = "0199a000-0000-7000-8000-0000000000p1";
const COMPANY = "0199a000-0000-7000-8000-0000000000c1";

let nextId = 0;

function finding(
  subjectType: Finding["subjectType"],
  label: string,
  value: string,
  secondsIn: number,
  subjectId = subjectType === "company" ? COMPANY : PERSON,
): Finding {
  nextId += 1;
  return {
    id: `f${nextId}`,
    workspaceId: "w",
    leadId: "l",
    subjectType,
    subjectId,
    label,
    value,
    sourceUrl: null,
    confidence: 0.8,
    traceId: "t",
    filled: true,
    createdAt: new Date(Date.UTC(2026, 9, 4, 12, 0, secondsIn)),
  };
}

function shown(findings: readonly Finding[]): string[] {
  return visibleFindings(findings).map((each) => `${each.label}=${each.value}`);
}

describe("visibleFindings", () => {
  it("keeps only the latest finding of a single-valued label", () => {
    assert.deepEqual(
      shown([
        finding("person", "title", "Engineer", 1),
        finding("person", "title", "VP Engineering", 9),
        finding("person", "title", "Staff Engineer", 5),
      ]),
      ["title=VP Engineering"],
    );
  });

  it("keeps every distinct value of a multi-valued label, newest first", () => {
    assert.deepEqual(
      shown([
        finding("company", "social_links", "https://x.com/resend", 1),
        finding("company", "social_links", "https://github.com/resend", 2),
        finding("company", "social_links", "HTTPS://X.COM/resend ", 3),
        finding("company", "recent_news", "2026-09: Resend raises Series B", 4),
      ]),
      [
        "social_links=HTTPS://X.COM/resend ",
        "social_links=https://github.com/resend",
        "recent_news=2026-09: Resend raises Series B",
      ],
    );
  });

  it("orders labels as FINDING_LABELS does, with unknown labels last", () => {
    assert.deepEqual(
      shown([
        finding("company", "employee_count", "40", 1),
        finding("company", "funding", "Series A", 2),
        finding("company", "domain", "resend.com", 3),
        finding("company", "name", "Resend", 4),
      ]),
      ["name=Resend", "domain=resend.com", "funding=Series A", "employee_count=40"],
    );
  });

  it("keeps the same label of different subjects apart", () => {
    const other = "0199a000-0000-7000-8000-0000000000p2";
    assert.deepEqual(
      shown([finding("person", "title", "CTO", 1), finding("person", "title", "CEO", 2, other)]),
      ["title=CEO", "title=CTO"],
    );
  });

  it("breaks a tie in time by id, newest first, as persistence's latest does", () => {
    // UUIDv7s: b2 was minted after a1. Both orders of the input agree.
    const older = { ...finding("person", "title", "CEO", 1), id: "01900000-0000-7000-8000-0000000000a1" };
    const newer = { ...finding("person", "title", "CTO", 1), id: "01900000-0000-7000-8000-0000000000b2" };
    assert.deepEqual(shown([older, newer]), ["title=CTO"]);
    assert.deepEqual(shown([newer, older]), ["title=CTO"]);
  });

  it("doesn't change its input", () => {
    const findings = [finding("person", "title", "A", 1), finding("person", "title", "B", 2)];
    const copy = [...findings];
    visibleFindings(findings);
    assert.deepEqual(findings, copy);
  });
});

describe("findingDisplay", () => {
  const display = (subjectType: Finding["subjectType"], label: string, value: string) =>
    findingDisplay({ subjectType, label, value });

  it("shows avatars round and logos square, for http(s) URLs only", () => {
    assert.deepEqual(display("person", "avatar_url", "https://gravatar.com/avatar/abc?d=404"), {
      kind: "image",
      url: "https://gravatar.com/avatar/abc?d=404",
      shape: "round",
    });
    assert.deepEqual(display("company", "logo_url", "https://resend.com/apple-touch-icon.png"), {
      kind: "image",
      url: "https://resend.com/apple-touch-icon.png",
      shape: "square",
    });
    for (const value of ["javascript:alert(1)", "data:image/png;base64,AAAA", "not a url"]) {
      assert.deepEqual(display("person", "avatar_url", value), { kind: "text", text: value }, value);
    }
  });

  it("shows a fit score from its stored 0–1 value", () => {
    assert.deepEqual(display("lead", "fit_score", "0.72"), { kind: "score", value: 0.72 });
    assert.deepEqual(display("lead", "fit_score", "0"), { kind: "score", value: 0 });
    for (const value of ["72", "", "high", "-0.1"]) {
      assert.deepEqual(display("lead", "fit_score", value), { kind: "text", text: value }, value);
    }
  });

  it("links profiles and social links by host and path", () => {
    assert.deepEqual(display("person", "public_profiles", "https://www.github.com/zenorocha/"), {
      kind: "link",
      href: "https://www.github.com/zenorocha/",
      text: "github.com/zenorocha",
    });
    assert.deepEqual(display("company", "social_links", "https://x.com/resend"), {
      kind: "link",
      href: "https://x.com/resend",
      text: "x.com/resend",
    });
  });

  it("words size bands and seniorities", () => {
    assert.deepEqual(display("company", "size_band", "11-50"), { kind: "text", text: "11–50 employees" });
    assert.deepEqual(display("company", "size_band", "10001+"), { kind: "text", text: "10001+ employees" });
    assert.deepEqual(display("person", "seniority", "c_level"), { kind: "text", text: "C-level" });
    assert.deepEqual(display("person", "seniority", "vp"), { kind: "text", text: "VP" });
    assert.deepEqual(display("person", "seniority", "individual_contributor"), {
      kind: "text",
      text: "Individual contributor",
    });
  });

  it("shows other values as they are", () => {
    assert.deepEqual(display("company", "funding", "Series B, $40M total (2024)"), {
      kind: "text",
      text: "Series B, $40M total (2024)",
    });
  });
});

describe("findingLabelName", () => {
  it("names every finding label", () => {
    for (const [subject, labels] of Object.entries(FINDING_LABELS)) {
      for (const label of labels) {
        const name = findingLabelName(subject, label);
        assert.ok(name !== "" && !name.includes("_"), `${subject}.${label}: ${name}`);
      }
    }
  });

  it("tells a company's name from a person's", () => {
    assert.equal(findingLabelName("company", "name"), "Company name");
    assert.equal(findingLabelName("person", "name"), "Name");
  });

  it("humanizes a label it doesn't know", () => {
    assert.equal(findingLabelName("company", "employee_count"), "Employee count");
    assert.equal(findingLabelName("robot", "title"), "Title");
  });
});

describe("compactUrl", () => {
  it("drops the scheme, www, query, fragment and trailing slash", () => {
    assert.equal(compactUrl("https://www.resend.com/about/?ref=home#team"), "resend.com/about");
    assert.equal(compactUrl("resend.com"), "resend.com");
  });

  it("is null for anything that isn't a web URL", () => {
    for (const value of [null, undefined, "", "not a url", "mailto:jane@acme.com", "jane@acme.com"]) {
      assert.equal(compactUrl(value), null, String(value));
    }
  });
});
