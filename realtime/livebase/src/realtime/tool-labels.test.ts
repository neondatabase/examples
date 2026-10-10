import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toolActivityLabel, toolErrorText, toolStepLabel } from "~/realtime/tool-labels";

describe("toolStepLabel", () => {
  it("labels the research tools from their input", () => {
    const cases: [string, unknown, string][] = [
      ["findCompanyWebsite", { name: "Fathom Analytics" }, "Finding the website for Fathom Analytics"],
      ["webSearch", { query: "Dane Knecht" }, "Searching the web for Dane Knecht"],
      ["lookupXProfile", { username: "zenorocha", reason: "linked from resend.com" }, "Looking up @zenorocha on X"],
      ["lookupGravatar", {}, "Checking Gravatar"],
      ["readWebPage", { url: "https://resend.com/about" }, "Reading resend.com/about"],
      ["wikidataLookup", { name: "Cloudflare", type: "company" }, "Looking up Cloudflare on Wikidata"],
      ["checkDomain", { domain: "resend.com" }, "Checking the domain resend.com"],
    ];
    for (const [tool, args, expected] of cases) {
      assert.equal(toolStepLabel(tool, args, true), expected, tool);
    }
  });

  it("names the search's category", () => {
    const label = (category: string) => toolStepLabel("webSearch", { query: "Resend", category }, true);
    assert.equal(label("news"), "Searching the news for Resend");
    assert.equal(label("github"), "Searching GitHub for Resend");
    assert.equal(label("company"), "Searching company sites for Resend");
    assert.equal(label("personal site"), "Searching personal sites for Resend");
    assert.equal(label("linkedin profile"), "Searching the web for Resend");
  });

  it("shortens a page's URL to its host and path", () => {
    const label = (url: string) => toolStepLabel("readWebPage", { url }, true);
    assert.equal(label("https://www.resend.com/about/?ref=home#team"), "Reading resend.com/about");
    assert.equal(label("http://resend.com/"), "Reading resend.com");
    assert.equal(label("resend.com/team"), "Reading resend.com/team");
    assert.equal(label("not a url"), "Reading not a url");
  });

  it("says whose photo it's reading a page for", () => {
    assert.equal(
      toolStepLabel("readWebPage", { url: "https://resend.com/team", person: "Zeno Rocha" }, false),
      "Reading resend.com/team for Zeno Rocha",
    );
  });

  it("reads an X handle given as a mention or a profile URL", () => {
    for (const username of ["@zeno", "x.com/zeno", "https://twitter.com/zeno?s=1", " zeno "]) {
      assert.equal(toolStepLabel("lookupXProfile", { username }, true), "Looking up @zeno on X", username);
    }
  });

  it("labels recorded findings with their value, in the past tense once they succeed", () => {
    const record = (args: object, succeeded = true) => toolStepLabel("recordFinding", args, succeeded);
    assert.equal(record({ subject: "person", label: "title", value: "VP Engineering" }), "Recorded title: VP Engineering");
    assert.equal(
      record({ subject: "person", label: "title", value: "VP Engineering" }, false),
      "Recording title: VP Engineering",
    );
    assert.equal(record({ subject: "company", label: "name", value: "Resend" }), "Recorded company name: Resend");
    assert.equal(
      record({ subject: "company", label: "hq_location", value: "San Francisco, CA, USA" }),
      "Recorded HQ location: San Francisco, CA, USA",
    );
    assert.equal(record({ subject: "company", label: "domain", value: "resend.com" }), "Recorded domain: resend.com");
  });

  it("shows a fit score as a percentage", () => {
    const score = (value: string) => toolStepLabel("recordFinding", { subject: "lead", label: "fit_score", value }, true);
    assert.equal(score("72"), "Recorded fit score: 72%");
    assert.equal(score("0.72"), "Recorded fit score: 72%");
    assert.equal(score("140"), "Recorded fit score: 100%");
    assert.equal(score("high"), "Recorded fit score: high");
  });

  it("names an avatar's source rather than its URL", () => {
    const avatar = (method?: string) =>
      toolStepLabel(
        "recordFinding",
        { subject: "person", label: "avatar_url", value: "https://unavatar.io/x.png", method },
        true,
      );
    assert.equal(avatar("gravatar"), "Recorded avatar from Gravatar");
    assert.equal(avatar("x"), "Recorded avatar from X");
    assert.equal(avatar("company_site"), "Recorded avatar from the company site");
    assert.equal(avatar("github"), "Recorded avatar from GitHub");
    assert.equal(avatar(), "Recorded avatar");
    assert.equal(
      toolStepLabel("recordFinding", { subject: "company", label: "logo_url", value: "https://resend.com/icon.png" }, true),
      "Recorded logo",
    );
  });

  it("shows profile and social links without their scheme", () => {
    assert.equal(
      toolStepLabel(
        "recordFinding",
        { subject: "person", label: "public_profiles", value: "https://github.com/zenorocha" },
        true,
      ),
      "Recorded profile: github.com/zenorocha",
    );
  });

  it("labels a colleague by name", () => {
    assert.equal(toolStepLabel("recordColleague", { name: "Jane Doe", title: "CTO" }, true), "Added colleague Jane Doe");
    assert.equal(toolStepLabel("recordColleague", { name: "Jane Doe" }, false), "Adding colleague Jane Doe");
  });

  it("matches tool names ignoring case and punctuation", () => {
    assert.equal(toolStepLabel("web-search", { query: "Acme" }, true), "Searching the web for Acme");
    assert.equal(toolStepLabel("RECORD_COLLEAGUE", { name: "Ana" }, true), "Added colleague Ana");
  });

  it("collapses whitespace and shortens long input", () => {
    const query = `${"word ".repeat(30)}end`;
    const label = toolStepLabel("webSearch", { query: `  Dane\n\tKnecht  ` }, true);
    assert.equal(label, "Searching the web for Dane Knecht");
    const long = toolStepLabel("webSearch", { query }, true) ?? "";
    assert.ok(long.endsWith("…"), long);
    assert.ok(long.length <= "Searching the web for ".length + 60, long);
  });

  it("returns null for an unknown tool or a missing or malformed input", () => {
    const cases: [string, unknown][] = [
      ["lookupCompany", { domain: "acme.com" }],
      ["webSearch", undefined],
      ["webSearch", { query: "   " }],
      ["webSearch", { query: 42 }],
      ["webSearch", ["Acme"]],
      ["readWebPage", {}],
      ["findCompanyWebsite", null],
      ["lookupXProfile", { username: "https://x.com/" }],
      ["lookupXProfile", { username: "not a handle" }],
      ["recordFinding", { label: "title", value: "CTO" }],
      ["recordFinding", "title"],
      ["recordColleague", { title: "CTO" }],
    ];
    for (const [tool, args] of cases) {
      assert.equal(toolStepLabel(tool, args, true), null, `${tool} ${JSON.stringify(args)}`);
    }
  });

  it("labels a finding with no value by its name alone", () => {
    assert.equal(toolStepLabel("recordFinding", { subject: "lead", label: "next_step" }, false), "Recording next step");
  });
});

describe("toolActivityLabel", () => {
  it("says what each tool does, without its input", () => {
    const cases: [string, string][] = [
      ["readWebPage", "Reading a web page"],
      ["wikidataLookup", "Checking Wikidata"],
      ["checkDomain", "Checking a domain"],
      ["findCompanyWebsite", "Finding the company website"],
      ["webSearch", "Searching the web"],
      ["lookupGravatar", "Checking Gravatar"],
      ["lookupXProfile", "Looking up an X profile"],
      ["recordFinding", "Recording a finding"],
      ["recordColleague", "Adding a colleague"],
    ];
    for (const [tool, expected] of cases) {
      assert.equal(toolActivityLabel(tool), expected, tool);
    }
  });

  it("matches tool names ignoring case and punctuation", () => {
    assert.equal(toolActivityLabel("web-search"), "Searching the web");
    assert.equal(toolActivityLabel("RECORD_FINDING"), "Recording a finding");
  });

  it("has no words for an unknown tool", () => {
    assert.equal(toolActivityLabel("lookupCompany"), null);
    assert.equal(toolActivityLabel(""), null);
  });
});

describe("toolErrorText", () => {
  const prefix = "Tool input validation failed for recordFinding. Please fix the following errors and try again:";

  it("keeps the issues of Mastra's validation failure and drops the echoed arguments", () => {
    const message =
      `${prefix}\n- label: Invalid enum value\n- confidence: Required\n\n` + 'Provided arguments: {"label":"- x"}';
    assert.equal(toolErrorText(message), "Invalid input — label: Invalid enum value; confidence: Required");
  });

  it("copes with a message the transcript clipped", () => {
    // Transcripts may be clipped, possibly mid-issue or before any issue.
    assert.equal(
      toolErrorText(`${prefix}\n- label: Invalid enum val…`),
      "Invalid input — label: Invalid enum val…",
    );
    assert.equal(toolErrorText(`${prefix}\n- label: Invalid\n\nProvided argu…`), "Invalid input — label: Invalid");
    assert.equal(toolErrorText("Tool input validation failed for recordFin…"), "Invalid input");
  });

  it("returns any other message as it is", () => {
    assert.equal(toolErrorText("robots.txt disallows this page"), "robots.txt disallows this page");
    assert.equal(toolErrorText("- not a validation failure"), "- not a validation failure");
  });
});
