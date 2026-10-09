import { Agent } from "@mastra/core/agent";
import { z } from "zod";

import { AGENT_IDS, LEAD_STAGES } from "~/lib/constants";
import { truncate } from "~/lib/format";

// `mastra.server.ts` imports this module too. The cycle is safe because each
// side only uses the other inside functions, never at load time.
import { getMastra, recordAbortedRun } from "./mastra.server";
import { modelCallError } from "./model-errors";
import { EXTRACTION_MODEL } from "./models";
import { getMemory } from "./storage.server";

// The structured output of one extraction. Every field the input may not
// support is nullable, so the model has an honest way to say "unknown".
export const extractionSchema = z.object({
  inputKind: z.enum(["email", "profile_url", "website", "name", "notes", "mixed"]),
  lead: z.object({
    title: z.string().describe("Short deal title, for example 'Acme — platform pilot'"),
    stage: z.enum(LEAD_STAGES).nullable().describe("Only when the input clearly states progress"),
    value: z.number().int().nullable().describe("Deal size in whole US dollars, only if stated"),
    summary: z.string().nullable().describe("One sentence on who this is and what they want"),
    nextStep: z.string().nullable().describe("A short, concrete next action"),
  }),
  person: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    title: z.string().nullable(),
    profileUrl: z.string().nullable(),
  }).nullable(),
  company: z.object({
    name: z.string().nullable(),
    domain: z.string().nullable(),
    website: z.string().nullable(),
  }).nullable(),
});

export type Extraction = z.infer<typeof extractionSchema>;

const instructions = `You turn a rough sales note into CRM records: a lead (the deal), the primary person, and the primary company.

Extract only what the input states or directly implies. Never invent people, companies, domains, websites, or deal values. Use null for anything unknown, and set person or company to null when the input doesn't mention one.

A company name is a proper name the input gives, such as "Acme" or "Linear". A description such as "a Series A healthtech company" or "a regional retailer" is not a name, so leave the name null and set company to null when nothing else identifies it; the summary can still say what kind of company it is.

A company domain in an email address is the company's domain: jane@acme.com works at acme.com. A personal email domain such as gmail.com, outlook.com, yahoo.com, or icloud.com is not a company, so it never becomes a company name, domain, or website.

A LinkedIn or other profile URL is the person's profileUrl, never a company website. A company's own URL, such as https://linear.app, is its website and gives its domain.

The lead title names the company, or the person when no company is named, and the opportunity, for example "Acme — platform pilot" or "Sam Rivera — pricing request". Convert a stated deal size such as "$50k annual" to whole dollars (50000); a seat count is not a deal value. Set stage only when the input clearly states progress.

Set inputKind to the input's main shape: email, profile_url, website, name, notes, or mixed when it combines several.`;

export const extractionAgent = new Agent({
  id: AGENT_IDS.extraction,
  name: "Extraction agent",
  instructions,
  model: EXTRACTION_MODEL,
  memory: getMemory(),
  // Mastra retries no model call by default, so one gateway 429 failed the
  // lead. Two retries usually fit the 30 s extraction timeout: the backoff is
  // 1 s, then 2 s. Mastra honours a Retry-After of up to 30 s on each retry,
  // though, so a long one runs into the timeout and the lead ends "Timed out"
  // rather than with the 429's reason.
  maxRetries: 2,
});

export async function extractLead(input: {
  leadId: string;
  workspaceId: string;
  rawText: string;
  signal: AbortSignal;
}): Promise<{ extraction: Extraction; traceId: string | null }> {
  const { leadId, workspaceId, rawText, signal } = input;

  // Going through `getMastra()` makes sure Mastra is built, which wires its
  // storage and tracing into the agent.
  const agent = getMastra().getAgent("extractionAgent");
  const result = await agent.generate(rawText, {
    // The thread is the lead and the resource is the workspace. That puts
    // `threadId` and `resourceId` on Mastra's message and span rows, which is
    // how live queries scope them.
    memory: {
      thread: {
        id: leadId,
        title: truncate(rawText.replace(/\s+/g, " ").trim(), 80),
        metadata: { leadId },
      },
      resource: workspaceId,
    },
    structuredOutput: { schema: extractionSchema },
    maxSteps: 1,
    // Persist messages after each step, not only when the call ends.
    savePerStep: true,
    abortSignal: signal,
  }).catch((error: unknown) => {
    // `generate` throws a failed model call's error rather than returning it.
    throw error instanceof Error ? modelCallError(error) : error;
  });

  // An aborted or timed-out call resolves with no object and no error, so
  // record why it stopped and pass the abort on.
  if (signal.aborted) {
    await recordAbortedRun(result, signal);
    signal.throwIfAborted();
  }
  if (result.error) {
    throw modelCallError(result.error);
  }
  // Defensive: aborts are handled above, so a call that ends without an error
  // should carry an object.
  if (!result.object) {
    throw new Error("Extraction returned no structured output");
  }
  return { extraction: result.object, traceId: result.traceId ?? null };
}
