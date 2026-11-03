import { randomUUID, timingSafeEqual } from "node:crypto";
import {
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = "uploads";
const UPLOAD_TTL_SECONDS = 300;
const DOWNLOAD_TTL_SECONDS = 3_600;
const MAX_LIST = 100;
const MIN_TOKEN_LENGTH = 32;

let s3: S3Client | undefined;

function getS3(): S3Client {
	s3 ??= new S3Client({
		forcePathStyle: true,
		requestChecksumCalculation: "WHEN_REQUIRED",
	});
	return s3;
}

function jsonError(message: string, status: number): Response {
	return Response.json({ error: message }, { status });
}

// Function URLs are public, so every route except GET / needs the caller token.
function checkAuth(request: Request): Response | null {
	const expected = process.env.UPLOADS_FUNCTION_TOKEN ?? "";
	if (expected.length < MIN_TOKEN_LENGTH) {
		return jsonError(
			`Set UPLOADS_FUNCTION_TOKEN to a random value of at least ${MIN_TOKEN_LENGTH} characters, for example from openssl rand -hex 32, then redeploy`,
			503,
		);
	}

	const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
	const provided = Buffer.from(match?.[1]?.trim() ?? "");
	const secret = Buffer.from(expected);
	if (provided.length === secret.length && timingSafeEqual(provided, secret)) return null;

	return Response.json(
		{ error: "Send Authorization: Bearer <UPLOADS_FUNCTION_TOKEN>" },
		{ status: 401, headers: { "www-authenticate": "Bearer" } },
	);
}

function isNotFound(error: unknown): boolean {
	const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
	return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
	try {
		const body: unknown = await request.json();
		return typeof body === "object" && body !== null && !Array.isArray(body)
			? (body as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

// Keep the object key a plain filename: no directories, no unsafe characters.
function safeFilename(value: string): string | null {
	const name = value.split(/[\\/]/).pop() ?? "";
	const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "").slice(0, 120);
	return cleaned || null;
}

async function listFiles() {
	const { Contents = [] } = await getS3().send(
		new ListObjectsV2Command({ Bucket: BUCKET, MaxKeys: MAX_LIST }),
	);
	const validObjects = Contents.filter((object: {Key: string; Size?: number; LastModified?: Date }) => object.Key);
	return validObjects.map((object: { Key: string; Size?: number; LastModified?: Date }) => ({
		key: object.Key,
		size: object.Size ?? 0,
		lastModified: object.LastModified?.toISOString() ?? null,
	}));
}

export default {
	async fetch(request: Request): Promise<Response> {
		const { pathname, searchParams } = new URL(request.url);

		if (pathname === "/") {
			return Response.json({
				name: "Presigned uploads with Neon Object Storage",
				bucket: BUCKET,
				setup: [
					`Declare the private bucket: neon config add bucket ${BUCKET}`,
					"Add UPLOADS_FUNCTION_TOKEN to .env.local, for example from openssl rand -hex 32.",
					"Run neon deploy --env .env.local to create the bucket and pull the AWS_* variables.",
				],
				tokenConfigured: (process.env.UPLOADS_FUNCTION_TOKEN ?? "").length >= MIN_TOKEN_LENGTH,
				auth: "Every route below needs Authorization: Bearer <UPLOADS_FUNCTION_TOKEN>.",
				routes: [
					"POST /uploads  { filename, contentType }",
					"GET /files",
					"GET /files/download?key=...",
				],
			});
		}

		const isKnownRoute =
			pathname === "/uploads" || pathname === "/files" || pathname === "/files/download";
		if (!isKnownRoute) return jsonError("Not found", 404);

		const denied = checkAuth(request);
		if (denied) return denied;

		if (pathname === "/uploads") {
			if (request.method !== "POST") return jsonError("Use POST", 405);

			const body = await readJson(request);
			const filename = typeof body?.filename === "string" ? safeFilename(body.filename) : null;
			const contentType =
				typeof body?.contentType === "string" ? body.contentType.trim() : "";
			if (!filename) {
				return jsonError("Send a JSON body with filename, e.g. photo.png", 400);
			}
			if (!/^[\w.+-]+\/[\w.+-]+$/.test(contentType)) {
				return jsonError("contentType must be a MIME type such as image/png", 400);
			}

			const key = `${randomUUID()}-${filename}`;
			try {
				const uploadUrl = await getSignedUrl(
					getS3(),
					new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
					{ expiresIn: UPLOAD_TTL_SECONDS, signableHeaders: new Set(["content-type"]) },
				);
				return Response.json(
					{
						key,
						uploadUrl,
						method: "PUT",
						headers: { "content-type": contentType },
						expiresIn: UPLOAD_TTL_SECONDS,
					},
					{ status: 201 },
				);
			} catch (error) {
				console.error("[presigned-uploads] could not sign upload:", error);
				return jsonError("Could not create the upload URL", 502);
			}
		}

		if (pathname === "/files") {
			if (request.method !== "GET") return jsonError("Use GET", 405);
			try {
				return Response.json({ bucket: BUCKET, files: await listFiles() });
			} catch (error) {
				console.error("[presigned-uploads] could not list objects:", error);
				return jsonError("Could not list objects", 502);
			}
		}

		if (pathname === "/files/download") {
			if (request.method !== "GET") return jsonError("Use GET", 405);

			const key = searchParams.get("key");
			if (!key || key.includes("..") || key.startsWith("/")) {
				return jsonError("Provide a key from GET /files", 400);
			}
			try {
				await getS3().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
			} catch (error) {
				if (isNotFound(error)) return jsonError("No file with that key. List keys with GET /files", 404);
				console.error("[presigned-uploads] could not read object:", error);
				return jsonError("Could not create the download URL", 502);
			}
			try {
				const downloadUrl = await getSignedUrl(
					getS3(),
					new GetObjectCommand({
						Bucket: BUCKET,
						Key: key,
						ResponseContentDisposition: `attachment; filename="${key.replace(/["\\]/g, "")}"`,
					}),
					{ expiresIn: DOWNLOAD_TTL_SECONDS },
				);
				return Response.json({ key, downloadUrl, expiresIn: DOWNLOAD_TTL_SECONDS });
			} catch (error) {
				console.error("[presigned-uploads] could not sign download:", error);
				return jsonError("Could not create the download URL", 502);
			}
		}

		return jsonError("Not found", 404);
	},
};
