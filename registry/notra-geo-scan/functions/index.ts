import { timingSafeEqual } from "node:crypto";
import { neon } from "@neon/ai-sdk-provider";
import { attachDatabasePool } from "@neon/functions";
import { parseTriggerDelivery } from "@neon/functions/triggers";
import { APICallError, generateText, Output, RetryError } from "ai";
import { Pool } from "pg";
import { z } from "zod";

// The models a scan asks, one per lab. Any text model on https://neon.com/models works.
const DEFAULT_MODELS = ["gpt-5-mini", "claude-haiku-5-5", "gemini-3-flash"];
// Writes prompts and reads answers. It needs structured output, which OpenAI models support.
const READER_MODEL = "gpt-5-mini";
const DEFAULT_PROMPT_COUNT = 5;
const MAX_PROMPTS = 10;
const MAX_MODELS = 5;
const MAX_COMPETITORS = 10;
// Model calls in flight at once, to stay under the AI Gateway token limits.
const CONCURRENCY = 8;
// A function must start responding within 15 minutes. After this long, /cron hands the
// remaining brands to a redelivery of the same trigger event.
const CRON_BUDGET_MS = 8 * 60_000;

const ROUTES = {
	"GET /": "This route index.",
	"POST /prompts": "Write buyer prompts for a brand, grounded in its homepage when you pass a domain.",
	"POST /scan": "Ask every model every prompt, then report visibility, position, share of voice, and sentiment.",
	"GET /scans/:id": "A stored scan with every answer.",
	"GET /report?brand=&days=": "Daily visibility per model, and the latest scan's summary.",
	"GET /tracked": "Brands the schedule trigger scans.",
	"DELETE /tracked/:brand": "Stop scanning a brand on schedule.",
	"POST /cron": "Rescan every tracked brand. Schedule trigger only.",
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

let schemaReady: Promise<void> | undefined;

function ensureSchema(): Promise<void> {
	schemaReady ??= pool
		.query(`
			CREATE TABLE IF NOT EXISTS geo_scans (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				brand text NOT NULL,
				config jsonb NOT NULL,
				summary jsonb NOT NULL,
				invocation_id text,
				created_at timestamptz NOT NULL DEFAULT now(),
				UNIQUE (invocation_id, brand)
			);
			CREATE INDEX IF NOT EXISTS geo_scans_brand_idx ON geo_scans (lower(brand), created_at DESC);
			CREATE TABLE IF NOT EXISTS geo_checks (
				id bigserial PRIMARY KEY,
				scan_id uuid NOT NULL REFERENCES geo_scans (id) ON DELETE CASCADE,
				prompt text NOT NULL,
				model text NOT NULL,
				answer text,
				brands text[] NOT NULL,
				mentioned boolean NOT NULL,
				position integer,
				competitors text[] NOT NULL,
				sentiment text,
				error text
			);
			CREATE INDEX IF NOT EXISTS geo_checks_scan_idx ON geo_checks (scan_id);
			CREATE TABLE IF NOT EXISTS geo_tracked (
				brand text NOT NULL,
				config jsonb NOT NULL,
				updated_at timestamptz NOT NULL DEFAULT now()
			);
			CREATE UNIQUE INDEX IF NOT EXISTS geo_tracked_brand_idx ON geo_tracked (lower(brand));
		`)
		.then(() => undefined)
		.catch((error) => {
			schemaReady = undefined;
			throw error;
		});
	return schemaReady;
}

const Name = z.string().trim().min(1).max(100);

const Domain = z
	.string()
	.transform((value) =>
		value
			.trim()
			.toLowerCase()
			.replace(/^https?:\/\//, "")
			.replace(/[/?#].*$/, ""),
	)
	.pipe(z.string().regex(/^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/, "Expected a domain such as neon.com"));

const ModelId = z.string().regex(/^[a-z0-9][a-z0-9.-]{1,63}$/);

const PromptsInput = z.object({
	brand: Name,
	domain: Domain.optional(),
	count: z.number().int().min(1).max(MAX_PROMPTS).default(DEFAULT_PROMPT_COUNT),
});

const ScanInput = z.object({
	brand: Name,
	domain: Domain.optional(),
	aliases: z.array(Name).max(5).default([]),
	competitors: z.array(Name).max(MAX_COMPETITORS).default([]),
	prompts: z.array(z.string().trim().min(3).max(500)).min(1).max(MAX_PROMPTS).optional(),
	models: z.array(ModelId).min(1).max(MAX_MODELS).default(DEFAULT_MODELS),
	track: z.boolean().default(false),
});

type ScanConfig = Omit<z.infer<typeof ScanInput>, "prompts" | "track"> & { prompts: string[] };

const PromptList = z.object({
	prompts: z.array(z.string()).describe("The questions, one per item"),
});

const Reading = z.object({
	brands: z
		.array(z.string())
		.describe(
			"The products in the order the answer presents them. Use the short product name, for example Neon rather than Neon Serverless Postgres.",
		),
	sentiment: z
		.enum(["positive", "neutral", "negative"])
		.nullable()
		.describe("How the answer talks about the target brand, or null if it does not name it"),
});

type Check = {
	prompt: string;
	model: string;
	answer: string | null;
	brands: string[];
	mentioned: boolean;
	position: number | null;
	competitors: string[];
	sentiment: "positive" | "neutral" | "negative" | null;
	error: string | null;
};

export default {
	async fetch(request: Request): Promise<Response> {
		try {
			return await handle(request);
		} catch (error) {
			console.error("[notra-geo-scan]", error);
			return Response.json({ error: "Internal error" }, { status: 500 });
		}
	},
};

async function handle(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const route = `${request.method} ${url.pathname.replace(/\/+$/, "") || "/"}`;

	if (route === "GET /") {
		return Response.json({ routes: ROUTES });
	}
	if (route === "POST /cron") {
		return runSchedule(request);
	}

	const token = process.env.GEO_SCAN_TOKEN;
	if (!token || token.length < 32) {
		return Response.json({ error: "Set GEO_SCAN_TOKEN to a random string of at least 32 characters" }, { status: 503 });
	}
	if (!bearerMatches(request, token)) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	if (route === "POST /prompts") {
		const input = await parseBody(request, PromptsInput);
		if (input instanceof Response) return input;
		try {
			return Response.json({ prompts: await writePrompts(input.brand, input.domain, input.count) });
		} catch (error) {
			return gatewayError(error);
		}
	}

	if (route === "POST /scan") {
		const input = await parseBody(request, ScanInput);
		if (input instanceof Response) return input;
		const { track, prompts, ...rest } = input;
		let config: ScanConfig;
		try {
			config = { ...rest, prompts: prompts ?? (await writePrompts(rest.brand, rest.domain, DEFAULT_PROMPT_COUNT)) };
		} catch (error) {
			return gatewayError(error);
		}
		if (config.prompts.length === 0) {
			return Response.json({ error: "The model wrote no usable prompts. Pass your own prompts." }, { status: 502 });
		}
		const checks = await runChecks(config);
		if (checks.every((check) => check.error)) {
			return errorFor(checks[0]?.error ?? "Model request failed");
		}
		await ensureSchema();
		if (track) {
			await pool.query(
				`INSERT INTO geo_tracked (brand, config) VALUES ($1, $2)
				 ON CONFLICT ((lower(brand))) DO UPDATE SET brand = EXCLUDED.brand, config = EXCLUDED.config, updated_at = now()`,
				[config.brand, config],
			);
		}
		const scan = await saveScan(config, checks, null);
		return Response.json(
			{ ...scan, tracked: track, checks: checks.map(({ answer, brands, ...check }) => ({ ...check, snippet: snippet(answer, config) })) },
			{ status: 201 },
		);
	}

	const scanMatch = route.match(/^GET \/scans\/([0-9a-f-]{36})$/);
	if (scanMatch) {
		await ensureSchema();
		const { rows } = await pool.query(
			`SELECT s.id, s.brand, s.config, s.summary, s.created_at AS "createdAt",
				coalesce((
					SELECT json_agg(json_build_object(
						'prompt', c.prompt, 'model', c.model, 'mentioned', c.mentioned, 'position', c.position,
						'competitors', c.competitors, 'sentiment', c.sentiment, 'brands', c.brands,
						'answer', c.answer, 'error', c.error
					) ORDER BY c.id)
					FROM geo_checks c WHERE c.scan_id = s.id
				), '[]') AS checks
			 FROM geo_scans s WHERE s.id = $1`,
			[scanMatch[1]],
		);
		if (!rows[0]) return Response.json({ error: "Scan not found" }, { status: 404 });
		return Response.json(rows[0]);
	}

	if (route === "GET /report") {
		const brand = url.searchParams.get("brand")?.trim();
		const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 365);
		if (!brand) return Response.json({ error: "Pass ?brand=" }, { status: 400 });
		return Response.json(await report(brand, days));
	}

	if (route === "GET /tracked") {
		await ensureSchema();
		const { rows } = await pool.query(
			`SELECT brand, config, updated_at AS "updatedAt" FROM geo_tracked ORDER BY lower(brand)`,
		);
		return Response.json({ tracked: rows });
	}

	const untrackMatch = route.match(/^DELETE \/tracked\/(.+)$/);
	if (untrackMatch) {
		await ensureSchema();
		const { rowCount } = await pool.query(`DELETE FROM geo_tracked WHERE lower(brand) = lower($1)`, [
			decodeURIComponent(untrackMatch[1]),
		]);
		return rowCount ? new Response(null, { status: 204 }) : Response.json({ error: "Not tracked" }, { status: 404 });
	}

	return Response.json({ error: "Not found", routes: ROUTES }, { status: 404 });
}

// The schedule trigger rescans every tracked brand. A redelivery of the same event skips the
// brands already saved for it, so a scan never runs twice for one scheduled run.
async function runSchedule(request: Request): Promise<Response> {
	const delivery = await parseTriggerDelivery(request);
	if (!delivery.ok) {
		return Response.json({ error: delivery.error }, { status: delivery.error === "invalid_body" ? 400 : 401 });
	}
	const invocationId = delivery.invocation.invocationId;
	await ensureSchema();
	const { rows } = await pool.query<{ config: ScanConfig }>(
		`SELECT t.config FROM geo_tracked t
		 WHERE NOT EXISTS (SELECT 1 FROM geo_scans s WHERE s.invocation_id = $1 AND lower(s.brand) = lower(t.brand))
		 ORDER BY lower(t.brand)`,
		[invocationId],
	);

	const started = Date.now();
	const scanned = [];
	const failed = [];
	for (const [index, { config }] of rows.entries()) {
		if (index > 0 && Date.now() - started > CRON_BUDGET_MS) {
			// The redelivery skips the brands saved so far and scans the rest.
			return Response.json(
				{ invocationId, scanned, failed, remaining: rows.length - index },
				{ status: 503, headers: { "Retry-After": "1" } },
			);
		}
		const checks = await runChecks(config);
		if (checks.every((check) => check.error)) {
			failed.push({ brand: config.brand, error: checks[0]?.error ?? "Model request failed" });
			continue;
		}
		const scan = await saveScan(config, checks, invocationId);
		scanned.push({ id: scan.id, brand: config.brand, visibility: scan.visibility });
	}
	if (failed.length > 0) {
		// Ask Neon to deliver this run again later, for the brands that failed.
		return Response.json({ invocationId, scanned, failed }, { status: 503, headers: { "Retry-After": "300" } });
	}
	return Response.json({ invocationId, scanned });
}

async function writePrompts(brand: string, domain: string | undefined, count: number): Promise<string[]> {
	const site = domain ? await readHomepage(domain) : "";
	const { output } = await generateText({
		model: neon(READER_MODEL),
		output: Output.object({ schema: PromptList }),
		prompt: [
			// A few spares, since questions that name the brand are dropped below.
			`Write ${count + 3} different questions that a potential customer would ask an AI assistant such as ChatGPT while choosing a product in ${brand}'s category.`,
			`The customer has never heard of ${brand}. Ask about the problem they need solved and the kind of product they want, not about features only ${brand} has, so that every product in the category has a fair chance to be recommended.`,
			'Write them the way people type them: short and specific, mixing "best X for Y", comparisons, alternatives, and how-to-choose questions.',
			`Never name ${brand} in a question.`,
			site ? `Use ${brand}'s homepage (${domain}) only to understand its category and customers:\n${site}` : "",
		]
			.filter(Boolean)
			.join("\n\n"),
	});
	// A question that names the brand would count a mention the model was handed.
	return output.prompts.filter((prompt) => !namesBrand(prompt, brand)).slice(0, count);
}

async function readHomepage(domain: string): Promise<string> {
	try {
		const response = await fetch(`https://${domain}`, {
			headers: { accept: "text/html", "user-agent": "notra-geo-scan (+https://usenotra.com)" },
			signal: AbortSignal.timeout(8_000),
		});
		if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return "";
		const html = (await response.text()).slice(0, 500_000);
		return html
			.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
			.replace(/<[^>]+>/g, " ")
			.replace(/&[#\w]+;/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 4_000);
	} catch {
		return "";
	}
}

async function runChecks(config: ScanConfig): Promise<Check[]> {
	const pairs = config.prompts.flatMap((prompt) => config.models.map((model) => ({ prompt, model })));
	return mapLimit(pairs, CONCURRENCY, ({ prompt, model }) => runCheck(config, prompt, model));
}

async function runCheck(config: ScanConfig, prompt: string, model: string): Promise<Check> {
	try {
		// Send the question alone, the way a person types it into a chat app.
		const { text: answer } = await generateText({ model: neon(model), prompt });
		const { output: reading } = await generateText({
			model: neon(READER_MODEL),
			output: Output.object({ schema: Reading }),
			prompt: [
				`Read this answer to the question "${prompt}".`,
				`List the commercial products and services it offers as choices for the question, including ${config.brand} if the answer names it. Skip open source tools, extensions, libraries, languages, and generic technologies such as Postgres or S3 when the answer names them as building blocks rather than as products to pick. List only names that appear in the answer.`,
				`Rate the answer's tone toward ${config.brand}.`,
				`<answer>\n${answer}\n</answer>`,
			].join("\n\n"),
		});
		// The reader model decides which names are products. The answer text decides whether they
		// appear and in what order, because the reader can invent or drop names.
		const names = brandNames(config);
		const mentioned = names.some((name) => namesBrand(answer, name));
		const found = reading.brands.flatMap((brand) => {
			const at = Math.max(firstIndex(answer, brand), firstIndex(answer, brand.split(/[\s/(,]/)[0]));
			return at >= 0 ? [{ brand, at }] : [];
		});
		if (mentioned && !found.some(({ brand }) => names.some((name) => namesBrand(brand, name)))) {
			const at = Math.min(...names.map((name) => firstIndex(answer, name)).filter((value) => value >= 0));
			found.push({ brand: config.brand, at });
		}
		const brands = found.sort((a, b) => a.at - b.at).map(({ brand }) => brand);
		const index = mentioned ? brands.findIndex((brand) => names.some((name) => namesBrand(brand, name))) : -1;
		return {
			prompt,
			model,
			answer,
			brands,
			mentioned,
			position: index >= 0 ? index + 1 : null,
			competitors: config.competitors.filter((competitor) => namesBrand(answer, competitor)),
			sentiment: mentioned ? reading.sentiment : null,
			error: null,
		};
	} catch (error) {
		console.error(`[notra-geo-scan] ${model} failed:`, error);
		return {
			prompt,
			model,
			answer: null,
			brands: [],
			mentioned: false,
			position: null,
			competitors: [],
			sentiment: null,
			error: describeError(error),
		};
	}
}

function summarize(config: ScanConfig, checks: Check[]) {
	const answered = checks.filter((check) => check.answer !== null);
	const rate = (part: number, whole: number) => (whole ? round(part / whole) : 0);
	const averagePosition = (list: Check[]) => {
		const positions = list.flatMap((check) => (check.position ? [check.position] : []));
		return positions.length ? round(positions.reduce((sum, value) => sum + value, 0) / positions.length) : null;
	};

	const mentions = new Map([[config.brand, answered.filter((check) => check.mentioned).length]]);
	for (const competitor of config.competitors) {
		mentions.set(competitor, answered.filter((check) => check.competitors.includes(competitor)).length);
	}
	const totalMentions = [...mentions.values()].reduce((sum, value) => sum + value, 0);

	const known = [...brandNames(config), ...config.competitors];
	const others = new Map<string, { name: string; mentions: number }>();
	for (const check of answered) {
		const seen = new Set<string>();
		for (const brand of check.brands) {
			const key = brand.toLowerCase();
			if (seen.has(key) || known.some((name) => namesBrand(brand, name))) continue;
			seen.add(key);
			const entry = others.get(key) ?? { name: brand, mentions: 0 };
			entry.mentions += 1;
			others.set(key, entry);
		}
	}

	const sentiment = { positive: 0, neutral: 0, negative: 0 };
	for (const check of answered) {
		if (check.sentiment) sentiment[check.sentiment] += 1;
	}

	return {
		visibility: rate(mentions.get(config.brand) ?? 0, answered.length),
		averagePosition: averagePosition(answered),
		shareOfVoice: Object.fromEntries([...mentions].map(([name, count]) => [name, rate(count, totalMentions)])),
		byModel: Object.fromEntries(
			config.models.map((model) => {
				const list = answered.filter((check) => check.model === model);
				return [
					model,
					{
						answers: list.length,
						mentions: list.filter((check) => check.mentioned).length,
						visibility: rate(list.filter((check) => check.mentioned).length, list.length),
						averagePosition: averagePosition(list),
					},
				];
			}),
		),
		sentiment,
		// Brands the answers recommend that you did not list as competitors.
		discoveredCompetitors: [...others.values()].sort((a, b) => b.mentions - a.mentions).slice(0, 10),
		checkCount: checks.length,
		failedChecks: checks.length - answered.length,
	};
}

async function saveScan(config: ScanConfig, checks: Check[], invocationId: string | null) {
	const summary = summarize(config, checks);
	const { rows } = await pool.query<{ id: string; created_at: Date }>(
		`WITH scan AS (
			INSERT INTO geo_scans (brand, config, summary, invocation_id) VALUES ($1, $2, $3, $4)
			ON CONFLICT (invocation_id, brand) DO NOTHING
			RETURNING id, created_at
		), saved AS (
			INSERT INTO geo_checks (scan_id, prompt, model, answer, brands, mentioned, position, competitors, sentiment, error)
			SELECT scan.id, c.prompt, c.model, c.answer, c.brands, c.mentioned, c.position, c.competitors, c.sentiment, c.error
			FROM scan, jsonb_to_recordset($5) AS c(
				prompt text, model text, answer text, brands text[], mentioned boolean,
				position integer, competitors text[], sentiment text, error text
			)
		)
		SELECT id, created_at FROM scan`,
		[config.brand, config, summary, invocationId, JSON.stringify(checks)],
	);
	return {
		id: rows[0]?.id ?? null,
		brand: config.brand,
		createdAt: rows[0]?.created_at ?? null,
		prompts: config.prompts,
		models: config.models,
		...summary,
	};
}

async function report(brand: string, days: number) {
	await ensureSchema();
	const [timeline, latest] = await Promise.all([
		pool.query<{ day: string; model: string; answers: number; mentions: number; avg_position: number | null }>(
			`SELECT to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD') AS day, c.model,
				count(*) FILTER (WHERE c.answer IS NOT NULL)::int AS answers,
				count(*) FILTER (WHERE c.mentioned)::int AS mentions,
				round(avg(c.position), 2)::float AS avg_position
			 FROM geo_scans s JOIN geo_checks c ON c.scan_id = s.id
			 WHERE lower(s.brand) = lower($1) AND s.created_at > now() - make_interval(days => $2)
			 GROUP BY 1, 2 ORDER BY 1, 2`,
			[brand, days],
		),
		pool.query(
			`SELECT id, brand, summary, created_at AS "createdAt" FROM geo_scans
			 WHERE lower(brand) = lower($1) ORDER BY created_at DESC LIMIT 1`,
			[brand],
		),
	]);

	const byDay = new Map<string, { day: string; answers: number; mentions: number; models: Record<string, unknown> }>();
	for (const row of timeline.rows) {
		const entry = byDay.get(row.day) ?? { day: row.day, answers: 0, mentions: 0, models: {} };
		entry.answers += row.answers;
		entry.mentions += row.mentions;
		entry.models[row.model] = {
			visibility: row.answers ? round(row.mentions / row.answers) : 0,
			averagePosition: row.avg_position,
		};
		byDay.set(row.day, entry);
	}

	return {
		brand: latest.rows[0]?.brand ?? brand,
		days,
		timeline: [...byDay.values()].map(({ answers, mentions, ...entry }) => ({
			...entry,
			visibility: answers ? round(mentions / answers) : 0,
		})),
		latest: latest.rows[0] ?? null,
	};
}

function brandNames(config: Pick<ScanConfig, "brand" | "aliases" | "domain">): string[] {
	return [config.brand, ...config.aliases, ...(config.domain ? [config.domain] : [])];
}

// True when `text` names `brand` as a whole word, so "Neon" matches "Neon Postgres" but not "Neonode".
function namesBrand(text: string, brand: string): boolean {
	return firstIndex(text, brand) >= 0;
}

// Where `brand` first appears in `text` as a whole word, or -1.
function firstIndex(text: string, brand: string): number {
	if (!brand.trim()) return -1;
	const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").exec(text);
	return match ? match.index + match[1].length : -1;
}

function snippet(answer: string | null, config: ScanConfig): string | null {
	if (!answer) return null;
	const text = answer.replace(/[*_#`>|]/g, "").replace(/\s+/g, " ");
	const names = brandNames(config);
	const index = Math.min(
		...names.map((name) => text.toLowerCase().indexOf(name.toLowerCase())).filter((value) => value >= 0),
	);
	if (!Number.isFinite(index)) return null;
	// About 80 characters before the mention and 160 after, cut at spaces.
	const start = index > 80 ? text.indexOf(" ", index - 80) + 1 : 0;
	const end = index + 160 < text.length ? text.lastIndexOf(" ", index + 160) : text.length;
	return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await fn(items[index]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T> | Response> {
	const body = await request.json().catch(() => undefined);
	if (body === undefined) return Response.json({ error: "Expected a JSON body" }, { status: 400 });
	const parsed = schema.safeParse(body);
	if (parsed.success) return parsed.data;
	return Response.json({ error: "Invalid body", issues: z.flattenError(parsed.error).fieldErrors }, { status: 400 });
}

function bearerMatches(request: Request, token: string): boolean {
	const presented = Buffer.from(request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1] ?? "");
	const expected = Buffer.from(token);
	return presented.length === expected.length && timingSafeEqual(presented, expected);
}

function describeError(error: unknown): string {
	const cause = RetryError.isInstance(error) ? error.lastError : error;
	const status = APICallError.isInstance(cause) ? cause.statusCode : undefined;
	if (APICallError.isInstance(cause) && cause.responseBody?.includes("REQUEST_LIMIT_EXCEEDED")) {
		return "AI Gateway daily spend limit reached. Retry after it resets, or ask Neon support to raise it.";
	}
	if (status === 429) return "AI Gateway rate limit reached";
	if (status === 401 || status === 403) return "AI Gateway rejected the credentials";
	if (status === 404) return "The model is not available on this branch";
	if (status === 400) return "The model rejected the request";
	if (!process.env.NEON_AI_GATEWAY_BASE_URL) {
		return "AI Gateway is not enabled. Run `neon config add ai-gateway`, then `neon deploy --env .env.local`.";
	}
	return "Model request failed";
}

function gatewayError(error: unknown): Response {
	console.error("[notra-geo-scan]", error);
	return errorFor(describeError(error));
}

function errorFor(message: string): Response {
	const status = message.startsWith("AI Gateway is not enabled") ? 503 : message.includes(" limit ") ? 429 : 502;
	return Response.json({ error: message }, { status });
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}
