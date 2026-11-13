import { randomUUID } from "node:crypto";
import { attachDatabasePool } from "@neon/functions";
import OpenAI from "openai";
import { Pool } from "pg";

const EMBEDDING_MODEL = "qwen3-embedding-0-6b";
const EMBEDDING_DIMENSIONS = 1024;

// Qwen3 Embedding expects a task instruction on queries and none on documents:
// its own config stores this prompt for `query` and an empty one for `document`.
const QUERY_INSTRUCTION =
	"Instruct: Given a search query, retrieve relevant passages that answer the query\nQuery: ";

const CHUNK_CHARS = 1_000;
const MAX_CONTENT_CHARS = 20_000;
const MAX_QUERY_CHARS = 2_000;
const MAX_ID_CHARS = 200;
const MAX_BODY_BYTES = 128 * 1024;

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

let schema: Promise<void> | undefined;

function ensureSchema(): Promise<void> {
	schema ??= (async () => {
		await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
		await pool.query(
			`CREATE TABLE IF NOT EXISTS memory_chunks (
				memory_id text NOT NULL,
				chunk_index integer NOT NULL,
				content text NOT NULL,
				embedding vector(${EMBEDDING_DIMENSIONS}) NOT NULL,
				created_at timestamptz NOT NULL DEFAULT now(),
				PRIMARY KEY (memory_id, chunk_index)
			)`,
		);
		await pool.query(
			`CREATE INDEX IF NOT EXISTS memory_chunks_embedding_idx
			 ON memory_chunks USING hnsw (embedding vector_cosine_ops)`,
		);
	})().catch((error) => {
		schema = undefined;
		throw error;
	});

	return schema;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonError(message: string, status: number): Response {
	return Response.json({ error: message }, { status });
}

async function readJson(
	request: Request,
): Promise<Record<string, unknown> | null> {
	const length = Number(request.headers.get("content-length") ?? "0");
	if (Number.isFinite(length) && length > MAX_BODY_BYTES) return null;

	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) return null;

	try {
		const body: unknown = JSON.parse(text);
		return isRecord(body) ? body : null;
	} catch {
		return null;
	}
}

function parseId(value: unknown): string | null {
	if (typeof value !== "string") return null;

	const id = value.trim();
	if (id.length === 0 || id.length > MAX_ID_CHARS) return null;
	if (/[\u0000-\u001f\u007f]/.test(id)) return null;
	return id;
}

// Split on blank lines, pack paragraphs up to CHUNK_CHARS, and break long
// paragraphs at a word boundary so no chunk exceeds the limit.
function chunkText(text: string): string[] {
	const paragraphs = text
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);
	const chunks: string[] = [];
	let current = "";

	function push(chunk: string) {
		if (chunk) chunks.push(chunk);
	}

	for (const paragraph of paragraphs) {
		if (paragraph.length > CHUNK_CHARS) {
			push(current);
			current = "";

			let rest = paragraph;
			while (rest.length > CHUNK_CHARS) {
				let cut = rest.lastIndexOf(" ", CHUNK_CHARS);
				if (cut < CHUNK_CHARS / 2) cut = CHUNK_CHARS;
				push(rest.slice(0, cut).trim());
				rest = rest.slice(cut).trim();
			}
			current = rest;
			continue;
		}

		const next = current ? `${current}\n\n${paragraph}` : paragraph;
		if (next.length > CHUNK_CHARS) {
			push(current);
			current = paragraph;
		} else {
			current = next;
		}
	}

	push(current);
	return chunks;
}

function createGateway(): OpenAI | null {
	const apiKey = process.env.NEON_AI_GATEWAY_TOKEN;
	const baseURL = process.env.NEON_AI_GATEWAY_BASE_URL;
	if (!apiKey || !baseURL) return null;

	return new OpenAI({ apiKey, baseURL: `${baseURL}/v1` });
}

async function embed(
	client: OpenAI,
	inputs: string[],
	kind: "document" | "query" = "document",
): Promise<number[][]> {
	const response = await client.embeddings.create({
		model: EMBEDDING_MODEL,
		input:
			kind === "query"
				? inputs.map((input) => `${QUERY_INSTRUCTION}${input}`)
				: inputs,
		encoding_format: "float",
	});

	const vectors = new Map<number, number[]>();
	for (const item of response.data) {
		const vector = item.embedding;
		if (
			!Array.isArray(vector) ||
			vector.length !== EMBEDDING_DIMENSIONS ||
			!vector.every(Number.isFinite)
		) {
			throw new Error("AI Gateway returned an invalid embedding");
		}
		vectors.set(item.index, vector);
	}

	return inputs.map((_, index) => {
		const vector = vectors.get(index);
		if (!vector) {
			throw new Error("AI Gateway returned an incomplete embedding batch");
		}
		return vector;
	});
}

async function saveMemory(
	id: string,
	chunks: string[],
	vectors: number[][],
): Promise<void> {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		for (let index = 0; index < chunks.length; index++) {
			await client.query(
				`INSERT INTO memory_chunks (memory_id, chunk_index, content, embedding)
				 VALUES ($1, $2, $3, $4::vector)
				 ON CONFLICT (memory_id, chunk_index) DO UPDATE SET
				   content = EXCLUDED.content,
				   embedding = EXCLUDED.embedding,
				   created_at = now()`,
				[id, index, chunks[index], JSON.stringify(vectors[index])],
			);
		}

		// Drop chunks left over when an upsert sends less text than before.
		await client.query(
			"DELETE FROM memory_chunks WHERE memory_id = $1 AND chunk_index >= $2",
			[id, chunks.length],
		);

		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK").catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

type MatchRow = {
	memory_id: string;
	chunk_index: number;
	content: string;
	score: number;
};

async function search(vector: number[], limit: number): Promise<MatchRow[]> {
	const { rows } = await pool.query<MatchRow>(
		`SELECT memory_id, chunk_index, content,
		        1 - (embedding <=> $1::vector) AS score
		 FROM memory_chunks
		 ORDER BY embedding <=> $1::vector
		 LIMIT $2`,
		[JSON.stringify(vector), limit],
	);
	return rows;
}

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		try {
			await ensureSchema();

			if (url.pathname === "/") {
				if (request.method !== "GET") {
					return new Response(null, { status: 405, headers: { Allow: "GET" } });
				}

				return Response.json({
					name: "Semantic memory with pgvector",
					model: EMBEDDING_MODEL,
					dimensions: EMBEDDING_DIMENSIONS,
					routes: [
						"POST /memory { id?, content }",
						"POST /recall { query, limit? }",
						"DELETE /memory?id=...",
					],
				});
			}

			if (url.pathname === "/memory" && request.method === "POST") {
				const body = await readJson(request);
				if (!body) {
					return jsonError("Send a JSON body with content", 400);
				}

				const id = body.id === undefined ? randomUUID() : parseId(body.id);
				if (!id) {
					return jsonError(
						`id must be 1-${MAX_ID_CHARS} characters when provided`,
						400,
					);
				}

				if (typeof body.content !== "string") {
					return jsonError("content must be a string", 400);
				}
				const content = body.content.trim();
				if (content.length === 0) {
					return jsonError("content must not be empty", 400);
				}
				if (content.length > MAX_CONTENT_CHARS) {
					return jsonError(
						`content must be at most ${MAX_CONTENT_CHARS} characters`,
						400,
					);
				}

				const client = createGateway();
				if (!client) {
					return jsonError(
						"AI Gateway is not enabled. Run `neon config add ai-gateway`, then `neon deploy --env .env.local`.",
						503,
					);
				}

				const chunks = chunkText(content);
				let vectors: number[][];
				try {
					vectors = await embed(client, chunks);
				} catch (error) {
					console.error("[pgvector-memory] embedding failed:", error);
					return jsonError("Embedding request failed", 502);
				}

				await saveMemory(id, chunks, vectors);

				return Response.json({
					id,
					chunks: chunks.length,
					model: EMBEDDING_MODEL,
				});
			}

			if (url.pathname === "/memory" && request.method === "DELETE") {
				const id = parseId(url.searchParams.get("id"));
				if (!id) {
					return jsonError(`Send ?id=<1-${MAX_ID_CHARS} characters>`, 400);
				}

				const result = await pool.query(
					"DELETE FROM memory_chunks WHERE memory_id = $1",
					[id],
				);
				if (result.rowCount === 0) {
					return jsonError("Memory not found", 404);
				}

				return Response.json({ id, chunksDeleted: result.rowCount });
			}

			if (url.pathname === "/recall") {
				if (request.method !== "POST") {
					return new Response(null, {
						status: 405,
						headers: { Allow: "POST" },
					});
				}

				const body = await readJson(request);
				if (!body) {
					return jsonError("Send a JSON body with query", 400);
				}

				if (typeof body.query !== "string") {
					return jsonError("query must be a string", 400);
				}
				const query = body.query.trim();
				if (query.length === 0) {
					return jsonError("query must not be empty", 400);
				}
				if (query.length > MAX_QUERY_CHARS) {
					return jsonError(
						`query must be at most ${MAX_QUERY_CHARS} characters`,
						400,
					);
				}

				const limit = body.limit === undefined ? DEFAULT_LIMIT : body.limit;
				if (
					typeof limit !== "number" ||
					!Number.isInteger(limit) ||
					limit < 1 ||
					limit > MAX_LIMIT
				) {
					return jsonError(
						`limit must be an integer from 1 to ${MAX_LIMIT}`,
						400,
					);
				}

				const client = createGateway();
				if (!client) {
					return jsonError(
						"AI Gateway is not enabled. Run `neon config add ai-gateway`, then `neon deploy --env .env.local`.",
						503,
					);
				}

				let vector: number[];
				try {
					vector = (await embed(client, [query], "query"))[0]!;
				} catch (error) {
					console.error("[pgvector-memory] embedding failed:", error);
					return jsonError("Embedding request failed", 502);
				}

				const matches = await search(vector, limit);
				return Response.json({
					query,
					model: EMBEDDING_MODEL,
					matches: matches.map((match) => ({
						id: match.memory_id,
						chunk: match.chunk_index,
						content: match.content,
						score: Math.round(match.score * 10_000) / 10_000,
					})),
				});
			}

			if (url.pathname === "/memory") {
				return new Response(null, {
					status: 405,
					headers: { Allow: "POST, DELETE" },
				});
			}

			return jsonError("Not found", 404);
		} catch (error) {
			console.error("[pgvector-memory] failed:", error);
			return jsonError("Memory store unavailable", 503);
		}
	},
};
