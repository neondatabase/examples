import { randomUUID } from "node:crypto";
import {
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = "uploads";
const UPLOAD_TTL_SECONDS = 300;
const DOWNLOAD_TTL_SECONDS = 3_600;
const MAX_LIST = 100;

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
					"Run neon deploy to create it and pull the AWS_* variables.",
				],
				routes: [
					"POST /uploads  { filename, contentType }",
					"GET /files",
					"GET /files/download?key=...",
				],
			});
		}

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
