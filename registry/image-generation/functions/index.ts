import { randomUUID } from "node:crypto";
import {
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { neon } from "@neon/ai-sdk-provider";
import { streamText } from "ai";

const BUCKET = "images";
const MODEL = "gpt-5-mini";
const IMAGE_MODEL = "gpt-image-2";
const IMAGE_CONTENT_TYPE = "image/jpeg";
const IMAGE_EXTENSION = "jpg";
const URL_TTL_SECONDS = 3_600;
const MAX_PROMPT_LENGTH = 2_000;

let s3: S3Client | undefined;

async function generateImage(prompt: string): Promise<string> {
	const result = streamText({
		model: neon(MODEL),
		prompt:
			"Generate an image that matches this request. Do not describe it, just " +
			`create the image.\n\n${prompt}`,
		tools: {
			image_generation: neon.tools.imageGeneration({
				model: IMAGE_MODEL,
				outputFormat: "jpeg",
				size: "1024x1024",
				quality: "low",
				outputCompression: 80,
			}),
		},
	});

	let base64: string | null = null;
	let streamError: unknown;

	for await (const part of result.fullStream) {
		if (part.type === "error") {
			streamError = part.error;
		}
		if (part.type === "tool-result" && part.toolName === "image_generation") {
			base64 ??= imageResultBase64(part.output);
		}
	}

	if (base64) return base64;
	if (streamError instanceof Error) throw streamError;
	throw new Error("The model did not return an image");
}

async function storeImage(base64: string) {
	const body = imageBytes(base64);
	if (body.byteLength === 0) {
		throw new Error("The generated image was empty");
	}

	const key = `generated/${randomUUID()}.${IMAGE_EXTENSION}`;
	const client = getS3();

	await client.send(
		new PutObjectCommand({
			Bucket: BUCKET,
			Key: key,
			Body: body,
			ContentType: IMAGE_CONTENT_TYPE,
		}),
	);

	const url = await getSignedUrl(
		client,
		new GetObjectCommand({ Bucket: BUCKET, Key: key }),
		{ expiresIn: URL_TTL_SECONDS },
	);

	return {
		url,
		key,
		bucket: BUCKET,
		contentType: IMAGE_CONTENT_TYPE,
		bytes: body.byteLength,
		expiresIn: URL_TTL_SECONDS,
	};
}

function getS3(): S3Client {
	s3 ??= new S3Client({
		forcePathStyle: true,
		requestChecksumCalculation: "WHEN_REQUIRED",
	});
	return s3;
}

function imageResultBase64(output: unknown): string | null {
	if (typeof output === "object" && output !== null && "result" in output) {
		const { result } = output;
		if (typeof result === "string") return result;
	}
	return null;
}

function imageBytes(base64: string): Buffer {
	const comma = base64.startsWith("data:") ? base64.indexOf(",") : -1;
	return Buffer.from(comma >= 0 ? base64.slice(comma + 1) : base64, "base64");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
		if (!contentType.startsWith("application/json")) {
			return Response.json({ error: "Send application/json with a prompt" }, { status: 415 });
		}

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return Response.json({ error: "Expected a JSON body" }, { status: 400 });
		}
		if (!isRecord(body) || typeof body.prompt !== "string") {
			return Response.json({ error: "Provide prompt as a string" }, { status: 400 });
		}

		const prompt = body.prompt.trim();
		if (prompt.length === 0 || prompt.length > MAX_PROMPT_LENGTH) {
			return Response.json(
				{ error: `prompt must be 1-${MAX_PROMPT_LENGTH} characters` },
				{ status: 400 },
			);
		}

		try {
			const base64 = await generateImage(prompt);
			const image = await storeImage(base64);

			return Response.json(
				{ prompt, ...image, model: MODEL, imageModel: IMAGE_MODEL },
				{ status: 201 },
			);
		} catch (error) {
			console.error("[image-generation] failed:", error);
			return Response.json({ error: "Image generation failed" }, { status: 502 });
		}
	},
};
