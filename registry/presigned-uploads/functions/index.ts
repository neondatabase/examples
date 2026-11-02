import { randomUUID } from "node:crypto";
import {
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Create the bucket with `neon config add bucket uploads`, then deploy.
const BUCKET = "uploads";
const PREFIX = "uploads/";
const UPLOAD_TTL_SECONDS = 300;
const DOWNLOAD_TTL_SECONDS = 3_600;
const MAX_FILENAME_LENGTH = 120;
const MAX_KEY_LENGTH = 1_024;
const MAX_LIST = 100;
const MAX_BODY_BYTES = 16_384;

let s3: S3Client | undefined;

function getS3(): S3Client {
	s3 ??= new S3Client({
		forcePathStyle: true,
		requestChecksumCalculation: "WHEN_REQUIRED",
	});
	return s3;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonError(message: string, status: number): Response {
	return Response.json({ error: message }, { status });
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
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

// Keep the object key under uploads/ and drop path traversal or control bytes.
function safeFilename(value: string): string | null {
	const base = value.split(/[\\/]/).pop() ?? "";
	const cleaned = base
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/\.{2,}/g, ".")
		.replace(/^[-.]+/, "")
		.slice(0, MAX_FILENAME_LENGTH);

	if (cleaned.length === 0 || /^\.+$/.test(cleaned)) return null;
	return cleaned;
}

function parseKey(value: string | null): string | null {
	if (!value) return null;
	if (value.length > MAX_KEY_LENGTH) return null;
	if (!value.startsWith(PREFIX)) return null;
	if (value.includes("..") || value.includes("\\") || value.includes("//")) {
		return null;
	}
	return value;
}

function contentDisposition(key: string): string {
	const name = key.slice(key.lastIndexOf("/") + 1).replace(/["\\]/g, "");
	return `attachment; filename="${name}"`;
}

async function listFiles() {
	const { Contents = [] } = await getS3().send(
		new ListObjectsV2Command({
			Bucket: BUCKET,
			Prefix: PREFIX,
			MaxKeys: MAX_LIST,
		}),
	);

	return Contents.flatMap((object) =>
		object.Key?.startsWith(PREFIX)
			? [
					{
						key: object.Key,
						size: object.Size ?? 0,
						lastModified: object.LastModified?.toISOString() ?? null,
					},
				]
			: [],
	);
}

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/") {
			return Response.json({
				name: "Presigned uploads with Neon Object Storage",
				routes: [
					"POST /uploads  { filename, contentType }",
					"GET /files",
					"GET /files/download?key=uploads/...",
				],
			});
		}

		if (url.pathname === "/uploads") {
			if (request.method !== "POST") {
				return jsonError("Use POST", 405);
			}

			const body = await readJson(request);
			if (!body) {
				return jsonError("Send a JSON body with filename and contentType", 400);
			}

			if (typeof body.filename !== "string" || body.filename.length > 255) {
				return jsonError("filename must be a string of at most 255 characters", 400);
			}
			const filename = safeFilename(body.filename);
			if (!filename) {
				return jsonError("filename must contain letters, digits, dot, dash or underscore", 400);
			}

			if (
				typeof body.contentType !== "string" ||
				body.contentType.length > 127 ||
				!/^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*$/.test(
					body.contentType,
				)
			) {
				return jsonError("contentType must be a MIME type such as image/png", 400);
			}

			const key = `${PREFIX}${randomUUID()}-${filename}`;

			try {
				const uploadUrl = await getSignedUrl(
					getS3(),
					new PutObjectCommand({
						Bucket: BUCKET,
						Key: key,
						ContentType: body.contentType,
					}),
					{ expiresIn: UPLOAD_TTL_SECONDS },
				);

				return Response.json(
					{
						key,
						uploadUrl,
						method: "PUT",
						headers: { "content-type": body.contentType },
						expiresIn: UPLOAD_TTL_SECONDS,
					},
					{ status: 201 },
				);
			} catch (error) {
				console.error("[presigned-uploads] could not sign upload:", error);
				return jsonError("Could not create the upload URL", 502);
			}
		}

		if (url.pathname === "/files") {
			if (request.method !== "GET") {
				return jsonError("Use GET", 405);
			}

			try {
				return Response.json({ bucket: BUCKET, files: await listFiles() });
			} catch (error) {
				console.error("[presigned-uploads] could not list objects:", error);
				return jsonError("Could not list objects", 502);
			}
		}

		if (url.pathname === "/files/download") {
			if (request.method !== "GET") {
				return jsonError("Use GET", 405);
			}

			const key = parseKey(url.searchParams.get("key"));
			if (!key) {
				return jsonError("Provide key=uploads/...", 400);
			}

			try {
				const downloadUrl = await getSignedUrl(
					getS3(),
					new GetObjectCommand({
						Bucket: BUCKET,
						Key: key,
						ResponseContentDisposition: contentDisposition(key),
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
