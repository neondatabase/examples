import { timingSafeEqual } from "node:crypto";
import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { PostgresStore } from "@mastra/pg";
import { attachDatabasePool } from "@neon/functions";
import { Pool } from "pg";
import { z } from "zod";

// Mastra sends usage telemetry to PostHog unless this is set. Set it to
// "false" to opt in.
process.env.MASTRA_TELEMETRY_DISABLED ??= "true";

// "neon/<model>" is any text model in the AI Gateway catalog:
// https://neon.com/docs/ai-gateway/models
const MODEL = "neon/claude-haiku-5-5";

// Workflow snapshots live in the mastra schema of this database, so a suspended
// run can be resumed by any instance, after a redeploy, or days later.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
attachDatabasePool(pool);
const storage = new PostgresStore({ id: "neon", pool, schemaName: "mastra" });

const writer = new Agent({
	id: "writer",
	name: "writer",
	instructions:
		"You write clear, friendly short-form copy. Reply with the text only, without a preamble.",
	model: MODEL,
});

const draftStep = createStep({
	id: "draft",
	inputSchema: z.object({ brief: z.string() }),
	outputSchema: z.object({ brief: z.string(), draft: z.string() }),
	execute: async ({ inputData }) => {
		const { text } = await writer.generate(
			`Write a first draft for this brief:\n\n${inputData.brief}`,
		);
		return { brief: inputData.brief, draft: text };
	},
});

// Suspends until a person approves the draft. Rejecting it with feedback
// revises the draft and suspends again; rejecting without feedback ends the run.
const approveStep = createStep({
	id: "approve",
	inputSchema: z.object({ brief: z.string(), draft: z.string() }),
	outputSchema: z.object({
		status: z.enum(["approved", "rejected"]),
		text: z.string(),
	}),
	suspendSchema: z.object({ draft: z.string() }),
	resumeSchema: z.object({
		approved: z.boolean(),
		feedback: z.string().optional(),
	}),
	execute: async ({ inputData, resumeData, suspendData, suspend }) => {
		const draft = suspendData?.draft ?? inputData.draft;
		if (!resumeData) {
			return suspend({ draft });
		}
		if (resumeData.approved) {
			return { status: "approved" as const, text: draft };
		}
		if (!resumeData.feedback) {
			return { status: "rejected" as const, text: draft };
		}
		const { text } = await writer.generate(
			`Brief:\n${inputData.brief}\n\nCurrent draft:\n${draft}\n\nRevise the draft using this feedback:\n${resumeData.feedback}`,
		);
		return suspend({ draft: text });
	},
});

const review = createWorkflow({
	id: "review",
	inputSchema: z.object({ brief: z.string() }),
	outputSchema: z.object({
		status: z.enum(["approved", "rejected"]),
		text: z.string(),
	}),
})
	.then(draftStep)
	.then(approveStep)
	.commit();

const mastra = new Mastra({
	agents: { writer },
	workflows: { review },
	storage,
});

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		const expectedToken = process.env.MASTRA_FUNCTION_TOKEN;
		if (!expectedToken || expectedToken.length < 32) {
			return Response.json(
				{ error: "Mastra function is not configured" },
				{ status: 503 },
			);
		}

		const providedToken =
			request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
		const expectedBytes = Buffer.from(expectedToken);
		const providedBytes = Buffer.from(providedToken);
		const isAuthorized =
			providedBytes.length === expectedBytes.length &&
			timingSafeEqual(providedBytes, expectedBytes);
		if (!isAuthorized) {
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Neon injects these on a linked branch with aiGateway enabled in neon.ts.
		if (
			!process.env.DATABASE_URL ||
			!process.env.NEON_AI_GATEWAY_BASE_URL ||
			!process.env.NEON_AI_GATEWAY_TOKEN
		) {
			return Response.json(
				{
					error:
						"DATABASE_URL or AI Gateway is missing. Run `neon config add ai-gateway`, then `neon deploy --env .env.local`.",
				},
				{ status: 503 },
			);
		}

		let input: unknown;
		try {
			input = await request.json();
		} catch {
			return Response.json({ error: "Expected a JSON body" }, { status: 400 });
		}

		// Start: { brief }. Resume: { runId, approved, feedback? }.
		const body =
			input && typeof input === "object" && !Array.isArray(input) ? input : {};
		const { brief, runId, approved, feedback } = body as Record<
			string,
			unknown
		>;
		const isStart =
			typeof brief === "string" &&
			brief.trim().length > 0 &&
			brief.length <= 4000 &&
			runId === undefined;
		const isResume =
			typeof runId === "string" &&
			/^[0-9a-f-]{36}$/i.test(runId) &&
			typeof approved === "boolean" &&
			(feedback === undefined ||
				(typeof feedback === "string" && feedback.length <= 4000)) &&
			brief === undefined;
		if (!isStart && !isResume) {
			return Response.json(
				{
					error:
						"Start with { brief } (1-4000 characters), or resume with { runId, approved, feedback? }",
				},
				{ status: 400 },
			);
		}

		const workflow = mastra.getWorkflow("review");
		try {
			let run: Awaited<ReturnType<typeof workflow.createRun>>;
			let result: Awaited<ReturnType<typeof run.start>>;
			if (isStart) {
				run = await workflow.createRun();
				result = await run.start({ inputData: { brief: brief as string } });
			} else {
				const snapshot = await workflow.getWorkflowRunById(runId as string);
				if (!snapshot) {
					return Response.json({ error: "Run not found" }, { status: 404 });
				}
				if (snapshot.status !== "suspended") {
					return Response.json(
						{
							error:
								snapshot.status === "success"
									? "Run already finished"
									: `Run is ${snapshot.status}, not awaiting review`,
						},
						{ status: 409 },
					);
				}
				run = await workflow.createRun({ runId: runId as string });
				result = await run.resume({
					step: approveStep,
					resumeData: {
						approved: approved as boolean,
						feedback: feedback as string | undefined,
					},
				});
			}

			if (result.status === "suspended") {
				const { draft } = result.steps.approve.suspendPayload as {
					draft: string;
				};
				return Response.json({
					runId: run.runId,
					status: "awaiting_review",
					draft,
				});
			}
			if (result.status === "success") {
				return Response.json({ runId: run.runId, ...result.result });
			}
			console.error("Mastra review run did not finish", result);
			return Response.json(
				{ runId: run.runId, error: "Review run failed" },
				{ status: 502 },
			);
		} catch (error) {
			console.error("Mastra review failed", error);
			return Response.json({ error: "Review request failed" }, { status: 502 });
		}
	},
};
