import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ToolsInput } from "@mastra/core/agent";

import type { ColleagueResult, ColleagueWrite, FindingResult, FindingWrite } from "~/server/persist.server";
import { RUN_LIMITS, RunBudget } from "~/server/enrichment/budget";
import { IMAGE_MIN_PX, recordTools, type RecordToolDeps } from "~/server/enrichment/record-tools.server";
import type { ImageCheck } from "~/server/enrichment/web/image";

// The record tools against fake persistence and a fake image check:
// no database and no network.

const LEAD = { leadId: "lead-1", workspaceId: "ws-1" };

interface Harness {
  readonly tools: ReturnType<typeof recordTools>;
  readonly findings: FindingWrite[];
  readonly colleagues: ColleagueWrite[];
  readonly imageChecks: { url: string; minPx: number }[];
  readonly dbErrors: Error[];
  readonly controller: AbortController;
  readonly budget: RunBudget;
}

function harness(options: {
  persistFinding?: (input: FindingWrite) => Promise<FindingResult>;
  persistColleague?: (input: ColleagueWrite) => Promise<ColleagueResult>;
  checkImage?: (url: string, minPx: number) => ImageCheck | Promise<ImageCheck>;
  companyId?: string | null;
  // The run's image-check limit.
  images?: number;
} = {}): Harness {
  const controller = new AbortController();
  const budget = new RunBudget(
    controller.signal,
    options.images === undefined ? RUN_LIMITS : { ...RUN_LIMITS, calls: { ...RUN_LIMITS.calls, image: options.images } },
  );
  const findings: FindingWrite[] = [];
  const colleagues: ColleagueWrite[] = [];
  const imageChecks: { url: string; minPx: number }[] = [];
  const dbErrors: Error[] = [];
  const deps: RecordToolDeps = {
    persistFinding: async (input) => {
      findings.push(input);
      return options.persistFinding
        ? options.persistFinding(input)
        : { ok: true, findingId: `f-${findings.length}`, subjectId: "s-1", filled: ["title"], companyId: options.companyId ?? "c-1", personId: "p-1" };
    },
    persistColleague: async (input) => {
      colleagues.push(input);
      return options.persistColleague
        ? options.persistColleague(input)
        : { ok: true, personId: `p-${colleagues.length + 1}`, created: true };
    },
    checkImageUrl: async (url, { minPx }) => {
      imageChecks.push({ url, minPx });
      return options.checkImage
        ? options.checkImage(url, minPx)
        : { ok: true, url: `${url}#final`, width: 400, height: 400, contentType: "image/png" };
    },
  };
  const tools = recordTools(
    {
      ...LEAD,
      budget,
      companyId: options.companyId === undefined ? "c-1" : options.companyId,
      onDatabaseError: (error) => {
        dbErrors.push(error);
        controller.abort(error);
      },
    },
    deps,
  );
  return { tools, findings, colleagues, imageChecks, dbErrors, controller, budget };
}

type Execute = (input: unknown, context: unknown) => Promise<Record<string, unknown>>;

function call(tool: { execute?: unknown }, input: Record<string, unknown>, context: unknown = {}) {
  assert.ok(tool.execute);
  return (tool.execute as Execute)(input, context);
}

const avatar = (method: string | undefined, value = `https://img.example/${method}.png`) => ({
  subject: "person",
  label: "avatar_url",
  value,
  confidence: 0.9,
  ...(method && { method }),
});

describe("recordFinding", () => {
  it("is a Mastra toolset entry", () => {
    const { tools } = harness();
    const toolset: ToolsInput = tools;
    assert.deepEqual(Object.keys(toolset).sort(), ["recordColleague", "recordFinding"]);
    assert.equal(tools.recordFinding.id, "recordFinding");
    assert.equal(tools.recordColleague.id, "recordColleague");
  });

  it("persists a fact with the run's trace ID and the lead", async () => {
    const h = harness();
    const span = { isValid: true, traceId: "trace-abc" };
    const result = await call(
      h.tools.recordFinding,
      { subject: "person", label: "title", value: "VP Engineering", sourceUrl: "https://acme.com/team", confidence: 0.8 },
      { tracingContext: { currentSpan: span } },
    );
    assert.equal(result.ok, true);
    assert.equal(result.recorded, true);
    assert.equal(h.findings.length, 1);
    const [write] = h.findings;
    assert.equal(write.traceId, "trace-abc");
    assert.equal(write.leadId, "lead-1");
    assert.equal(write.workspaceId, "ws-1");
    assert.equal(write.value, "VP Engineering");
    assert.equal(write.sourceUrl, "https://acme.com/team");
    assert.equal(write.signal?.aborted, false);
  });

  it("stores no trace ID for a no-op span", async () => {
    const h = harness();
    await call(
      h.tools.recordFinding,
      { subject: "lead", label: "next_step", value: "Book a demo.", confidence: 0.6 },
      { tracingContext: { currentSpan: { isValid: false, traceId: "no-op-trace" } } },
    );
    assert.equal(h.findings[0].traceId, null);
  });

  it("drops an off-limits source but keeps the fact", async () => {
    const h = harness();
    const result = await call(h.tools.recordFinding, {
      subject: "person",
      label: "title",
      value: "CTO",
      sourceUrl: "https://www.linkedin.com/in/someone/",
      confidence: 0.7,
    });
    assert.equal(result.ok, true);
    assert.equal(h.findings[0].sourceUrl, null);
  });

  it("refuses an off-limits URL as a value, before any image check", async () => {
    const h = harness();
    const offLimits = [
      { subject: "company", label: "social_links", value: "https://www.linkedin.com/company/resend" },
      { subject: "person", label: "public_profiles", value: "https://www.zoominfo.com/p/Jane-Doe/123" },
      { subject: "person", label: "public_profiles", value: " https://uk.linkedin.com/in/someone-else " },
      { subject: "company", label: "logo_url", value: "https://media.licdn.com/dms/image/logo.png" },
      { ...avatar("company_site", "https://media.licdn.com/dms/image/face.jpg") },
    ];
    for (const input of offLimits) {
      const result = await call(h.tools.recordFinding, { confidence: 0.9, ...input });
      assert.equal(result.ok, false, input.value);
      assert.match(String(result.error), /off-limits site/);
    }
    assert.equal(h.imageChecks.length, 0);
    assert.equal(h.findings.length, 0);
    // A worse avatar method afterwards isn't blocked by the refused one.
    assert.equal((await call(h.tools.recordFinding, avatar("github"))).ok, true);
  });

  it("records other URLs, and an off-limits domain as text values", async () => {
    const h = harness();
    const ok = [
      { subject: "company", label: "social_links", value: "https://x.com/resend" },
      { subject: "person", label: "public_profiles", value: "https://github.com/zenorocha" },
      // LinkedIn can be a lead's employer; only URL values are refused.
      { subject: "company", label: "domain", value: "linkedin.com" },
      { subject: "company", label: "name", value: "LinkedIn" },
    ];
    for (const input of ok) {
      assert.equal((await call(h.tools.recordFinding, { confidence: 0.9, ...input })).ok, true, input.value);
    }
    assert.equal(h.findings.length, 4);
  });

  it("refuses a label that isn't the subject's", async () => {
    const h = harness();
    const result = await call(h.tools.recordFinding, { subject: "person", label: "domain", value: "acme.com", confidence: 1 });
    assert.equal(result.ok, false);
    assert.match(String(result.error), /isn't a person label/);
    assert.equal(h.findings.length, 0);
  });

  it("passes persist's refusal to the model", async () => {
    const h = harness({
      persistFinding: async () => ({ ok: false, reason: "no_subject", message: "Record company.domain or company.name first." }),
    });
    const result = await call(h.tools.recordFinding, { subject: "company", label: "industry", value: "Email", confidence: 0.9 });
    assert.deepEqual(result, { ok: false, error: "Record company.domain or company.name first." });
  });

  it("notes a duplicate and a newly linked company", async () => {
    const h = harness({
      companyId: null,
      persistFinding: async () => ({ ok: true, findingId: null, subjectId: "c-9", filled: [], companyId: "c-9", personId: "p-1" }),
    });
    const first = await call(h.tools.recordFinding, { subject: "company", label: "domain", value: "acme.com", confidence: 1 });
    assert.equal(first.recorded, false);
    assert.match(String(first.note), /Already the latest value/);
    assert.match(String(first.company), /now linked/);
    const second = await call(h.tools.recordFinding, { subject: "company", label: "domain", value: "acme.com", confidence: 1 });
    assert.equal(second.company, undefined);
  });

  it("requires method for person.avatar_url", async () => {
    const h = harness();
    const result = await call(h.tools.recordFinding, avatar(undefined, "https://img.example/a.png"));
    assert.equal(result.ok, false);
    assert.match(String(result.error), /needs method/);
    assert.equal(h.imageChecks.length, 0);
    assert.equal(h.findings.length, 0);
  });

  it("checks avatars at 64 px and logos at 32 px, and stores the final URL", async () => {
    const h = harness();
    const recorded = await call(h.tools.recordFinding, avatar("gravatar"));
    assert.equal(recorded.ok, true);
    await call(h.tools.recordFinding, { subject: "company", label: "logo_url", value: "https://acme.com/icon.png", confidence: 0.9 });
    assert.deepEqual(h.imageChecks, [
      { url: "https://img.example/gravatar.png", minPx: IMAGE_MIN_PX.avatar },
      { url: "https://acme.com/icon.png", minPx: IMAGE_MIN_PX.logo },
    ]);
    assert.equal(h.findings[0].value, "https://img.example/gravatar.png#final");
    assert.equal(h.findings[1].value, "https://acme.com/icon.png#final");
  });

  it("records nothing when the image check fails", async () => {
    const h = harness({ checkImage: () => ({ ok: false, reason: "The image is 48×48 px; it needs to be at least 64 px across" }) });
    const result = await call(h.tools.recordFinding, avatar("company_site"));
    assert.equal(result.ok, false);
    assert.match(String(result.error), /failed its check.*48×48/);
    assert.equal(h.findings.length, 0);
  });

  it("charges each image check, and refuses one once the checks are spent", async () => {
    const h = harness({ images: 2 });
    const logo = { subject: "company", label: "logo_url", value: "https://acme.com/icon.png", confidence: 0.9 };
    assert.equal((await call(h.tools.recordFinding, avatar("x"))).ok, true);
    assert.equal((await call(h.tools.recordFinding, logo)).ok, true);
    assert.equal(h.budget.used("image"), 2);

    const spent = await call(h.tools.recordFinding, avatar("gravatar"));
    assert.equal(spent.ok, false);
    assert.match(String(spent.error), /couldn't be checked, so nothing was recorded\. Image-check budget spent \(2 checks\)/);
    assert.equal(h.imageChecks.length, 2);
    assert.equal(h.findings.length, 2);
    // Facts that aren't images still record.
    assert.equal((await call(h.tools.recordFinding, { subject: "person", label: "title", value: "CTO", confidence: 0.9 })).ok, true);
    assert.equal(h.findings.length, 3);
  });

  it("charges no check for an image refused before its check", async () => {
    const h = harness({ images: 1 });
    assert.equal((await call(h.tools.recordFinding, avatar(undefined, "https://img.example/a.png"))).ok, false);
    assert.equal(
      (await call(h.tools.recordFinding, { subject: "company", label: "logo_url", value: "https://media.licdn.com/logo.png", confidence: 0.9 })).ok,
      false,
    );
    assert.equal(h.budget.used("image"), 0);
    assert.equal((await call(h.tools.recordFinding, avatar("gravatar"))).ok, true);
    // A worse-ranked method is refused before it would spend a check.
    const worse = await call(h.tools.recordFinding, avatar("github"));
    assert.match(String(worse.error), /method "gravatar"/);
    assert.equal(h.budget.used("image"), 1);
    assert.equal(h.imageChecks.length, 1);
  });

  it("won't let a worse-ranked method replace this run's avatar", async () => {
    const h = harness();
    assert.equal((await call(h.tools.recordFinding, avatar("x"))).ok, true);
    const worse = await call(h.tools.recordFinding, avatar("github"));
    assert.equal(worse.ok, false);
    assert.match(String(worse.error), /method "x"/);
    // Rejected before fetching the image.
    assert.equal(h.imageChecks.length, 1);
    // The same or a better method may replace it.
    assert.equal((await call(h.tools.recordFinding, avatar("x", "https://img.example/x2.png"))).ok, true);
    assert.equal((await call(h.tools.recordFinding, avatar("gravatar"))).ok, true);
    assert.equal((await call(h.tools.recordFinding, avatar("x"))).ok, false);
    assert.deepEqual(h.findings.map((write) => write.value), [
      "https://img.example/x.png#final",
      "https://img.example/x2.png#final",
      "https://img.example/gravatar.png#final",
    ]);
  });

  it("keeps the better avatar when two land in one step", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const h = harness({
      checkImage: async (url) => {
        // The github image is slow to check, so gravatar's write lands first.
        if (url.includes("github")) await gate;
        return { ok: true, url, width: 400, height: 400, contentType: "image/png" };
      },
    });
    const github = call(h.tools.recordFinding, avatar("github"));
    const gravatar = await call(h.tools.recordFinding, avatar("gravatar"));
    release();
    assert.equal(gravatar.ok, true);
    assert.equal((await github).ok, false);
    assert.deepEqual(h.findings.map((write) => write.value), ["https://img.example/gravatar.png"]);
  });

  it("throws, and doesn't write, when the run is already aborted", async () => {
    const h = harness();
    h.controller.abort(new DOMException("Cancelled", "AbortError"));
    await assert.rejects(
      call(h.tools.recordFinding, { subject: "person", label: "title", value: "CTO", confidence: 1 }),
      { name: "AbortError" },
    );
    assert.equal(h.findings.length, 0);
    assert.equal(h.dbErrors.length, 0);
  });

  it("passes an abort during the write through, not as a database error", async () => {
    const h = harness({
      persistFinding: async (input) => {
        h.controller.abort(new DOMException("Timed out", "TimeoutError"));
        input.signal?.throwIfAborted();
        throw new Error("unreachable");
      },
    });
    await assert.rejects(
      call(h.tools.recordFinding, { subject: "person", label: "title", value: "CTO", confidence: 1 }),
      { name: "TimeoutError" },
    );
    assert.equal(h.dbErrors.length, 0);
  });

  it("hands a database error to the run and rethrows it", async () => {
    const failure = new Error('relation "findings" does not exist');
    const h = harness({ persistFinding: async () => { throw failure; } });
    await assert.rejects(
      call(h.tools.recordFinding, { subject: "person", label: "title", value: "CTO", confidence: 1 }),
      (error) => error === failure,
    );
    assert.deepEqual(h.dbErrors, [failure]);
    assert.equal(h.controller.signal.reason, failure);
    // Later calls stop as aborted.
    await assert.rejects(call(h.tools.recordFinding, { subject: "person", label: "title", value: "CTO", confidence: 1 }));
    assert.equal(h.dbErrors.length, 1);
  });
});

describe("recordColleague", () => {
  const colleague = (name: string, extra: Record<string, unknown> = {}) => ({ name, title: "Engineer", confidence: 0.8, ...extra });

  it("records a colleague with a checked photo", async () => {
    const h = harness();
    const result = await call(
      h.tools.recordColleague,
      colleague("Jane Doe", { photoUrl: "https://acme.com/jane.jpg", sourceUrl: "https://acme.com/team" }),
      { tracingContext: { currentSpan: { isValid: true, traceId: "trace-1" } } },
    );
    assert.deepEqual(result, { ok: true, created: true, photo: true });
    assert.deepEqual(h.imageChecks, [{ url: "https://acme.com/jane.jpg", minPx: IMAGE_MIN_PX.avatar }]);
    const [write] = h.colleagues;
    assert.equal(write.avatarUrl, "https://acme.com/jane.jpg#final");
    assert.equal(write.title, "Engineer");
    assert.equal(write.sourceUrl, "https://acme.com/team");
    assert.equal(write.traceId, "trace-1");
  });

  it("drops a photo that fails its check but keeps the colleague", async () => {
    const h = harness({ checkImage: () => ({ ok: false, reason: "HTTP 404 from https://acme.com/jane.jpg" }) });
    const result = await call(h.tools.recordColleague, colleague("Jane Doe", { photoUrl: "https://acme.com/jane.jpg" }));
    assert.equal(result.ok, true);
    assert.equal(result.photo, false);
    assert.match(String(result.photoError), /HTTP 404/);
    assert.equal(h.colleagues[0].avatarUrl, null);
  });

  it("drops a photo unchecked once the checks are spent, and keeps the colleague", async () => {
    const h = harness({ images: 1 });
    const first = await call(h.tools.recordColleague, colleague("Jane Doe", { photoUrl: "https://acme.com/jane.jpg" }));
    assert.equal(first.photo, true);
    const second = await call(h.tools.recordColleague, colleague("John Roe", { photoUrl: "https://acme.com/john.jpg" }));
    assert.equal(second.ok, true);
    assert.equal(second.photo, false);
    assert.match(String(second.photoError), /couldn't be checked: Image-check budget spent \(1 checks\)/);
    assert.deepEqual(h.imageChecks.map((check) => check.url), ["https://acme.com/jane.jpg"]);
    assert.deepEqual(h.colleagues.map((write) => write.avatarUrl), ["https://acme.com/jane.jpg#final", null]);
    // A colleague without a photo takes no check.
    assert.equal((await call(h.tools.recordColleague, colleague("Ann Poe"))).ok, true);
    assert.equal(h.budget.used("image"), 1);
    assert.equal(h.budget.used("colleague"), 3);
  });

  it("drops an off-limits source", async () => {
    const h = harness();
    await call(h.tools.recordColleague, colleague("Jane Doe", { sourceUrl: "https://uk.linkedin.com/in/jane" }));
    assert.equal(h.colleagues[0].sourceUrl, null);
  });

  it("refuses an off-limits profile or photo URL without spending the cap", async () => {
    const h = harness();
    const profile = await call(h.tools.recordColleague, colleague("Jane Doe", { profileUrl: "https://www.linkedin.com/in/jane-doe" }));
    assert.equal(profile.ok, false);
    assert.match(String(profile.error), /profileUrl is on .*off-limits.*Call recordColleague again without it/);
    const photo = await call(h.tools.recordColleague, colleague("Jane Doe", { photoUrl: "https://media.licdn.com/dms/image/jane.jpg" }));
    assert.equal(photo.ok, false);
    assert.match(String(photo.error), /photoUrl is on/);
    assert.equal(h.imageChecks.length, 0);
    assert.equal(h.colleagues.length, 0);

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => call(h.tools.recordColleague, colleague(`Person ${i}`, { profileUrl: `https://acme.com/team/${i}` }))),
    );
    assert.equal(results.filter((result) => result.ok === true).length, 6);
    assert.equal(h.colleagues[0].profileUrl, "https://acme.com/team/0");
  });

  it("stops at the per-run colleague cap", async () => {
    const h = harness();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => call(h.tools.recordColleague, colleague(`Person ${i}`))),
    );
    assert.equal(results.filter((result) => result.ok === true).length, 6);
    const refused = results.filter((result) => result.ok === false);
    assert.equal(refused.length, 2);
    assert.match(String(refused[0].error), /Colleague limit reached/);
    assert.equal(h.colleagues.length, 6);
  });

  it("passes persist's refusal to the model", async () => {
    const h = harness({
      persistColleague: async () => ({ ok: false, reason: "is_lead_person", message: "That's the lead's own person." }),
    });
    assert.deepEqual(await call(h.tools.recordColleague, colleague("Zeno Rocha")), {
      ok: false,
      error: "That's the lead's own person.",
    });
  });

  it("throws when the run is aborted", async () => {
    const h = harness();
    h.controller.abort(new DOMException("Cancelled", "AbortError"));
    await assert.rejects(call(h.tools.recordColleague, colleague("Jane Doe")), { name: "AbortError" });
    assert.equal(h.colleagues.length, 0);
  });

  it("hands a database error to the run and rethrows it", async () => {
    const failure = new Error("deadlock detected");
    const h = harness({ persistColleague: async () => { throw failure; } });
    await assert.rejects(call(h.tools.recordColleague, colleague("Jane Doe")), (error) => error === failure);
    assert.deepEqual(h.dbErrors, [failure]);
  });
});
