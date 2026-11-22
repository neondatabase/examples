import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { neon } from "@neon/ai-sdk-provider";
import { attachDatabasePool } from "@neon/functions";
import { parseTriggerDelivery } from "@neon/functions/triggers";
import { generateText, Output } from "ai";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { bigint, index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { z } from "zod";

const MODEL = "gpt-6-luna";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const EXTENSIONS: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
};

const ROUTES = {
	"GET /": "This route index.",
	"POST /object":
		"Function Trigger deliveries for storage_object_created. Describes the new image and upserts it into image_descriptions.",
};

export const imageDescriptions = pgTable(
	"image_descriptions",
	{
		bucket: text("bucket").notNull(),
		key: text("key").notNull(),
		etag: text("etag").notNull(),
		contentType: text("content_type").notNull(),
		sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
		altText: text("alt_text").notNull(),
		tags: text("tags").array().notNull().default([]),
		visibleText: text("visible_text").array().notNull().default([]),
		model: text("model").notNull(),
		describedAt: timestamp("described_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.bucket, table.key] }),
		index("image_descriptions_tags_idx").using("gin", table.tags),
	],
);

const pool = new Pool({
	connectionString: process.env.DATABASE_URL?.replace("sslmode=require", "sslmode=verify-full"),
	max: 3,
});
attachDatabasePool(pool);
const db = drizzle(pool);

let s3: S3Client | undefined;

function getS3(): S3Client {
	s3 ??= new S3Client({
		forcePathStyle: true,
		requestChecksumCalculation: "WHEN_REQUIRED",
	});
	return s3;
}

const descriptionSchema = z.object({
	altText: z
		.string()
		.describe(
			"Alt text for a screen reader. One sentence of at most 125 characters that does not start with 'Image of' or 'Picture of'.",
		),
	tags: z
		.array(z.string())
		.max(10)
		.describe("Short lowercase tags that someone would search for to find this image."),
	visibleText: z
		.array(z.string())
		.max(20)
		.describe("Text that is visible in the image, transcribed exactly. Empty when there is none."),
});

function mediaTypeOf(key: string, contentType: string | undefined): string | null {
	const declared = contentType?.split(";")[0]?.trim().toLowerCase();
	if (declared && MEDIA_TYPES.has(declared)) return declared;
	const extension = key.split(".").pop()?.toLowerCase() ?? "";
	return EXTENSIONS[extension] ?? null;
}

function isNotFound(error: unknown): boolean {
	const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
	return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

function skipped(bucket: string, key: string, reason: string): Response {
	return Response.json({ status: "skipped", bucket, key, reason });
}

async function describeObject(bucket: string, key: string): Promise<Response> {
	let head;
	try {
		head = await getS3().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
	} catch (error) {
		if (isNotFound(error)) return skipped(bucket, key, "The object was deleted before it could be read.");
		throw error;
	}

	const mediaType = mediaTypeOf(key, head.ContentType);
	if (!mediaType) return skipped(bucket, key, "The object is not a JPEG, PNG, GIF, or WebP image.");

	const size = head.ContentLength ?? 0;
	if (size === 0) return skipped(bucket, key, "The object is empty.");
	if (size > MAX_IMAGE_BYTES) {
		return skipped(bucket, key, `The image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
	}

	const etag = head.ETag ?? "";
	const existing = await db
		.select({ etag: imageDescriptions.etag })
		.from(imageDescriptions)
		.where(
			and(
				eq(imageDescriptions.bucket, bucket),
				eq(imageDescriptions.key, key),
				eq(imageDescriptions.etag, etag),
			),
		)
		.limit(1);
	if (existing.length > 0) return skipped(bucket, key, "This version of the object is already described.");

	const object = await getS3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
	if (!object.Body) throw new Error(`Object Storage returned no body for ${bucket}/${key}`);
	const bytes = await object.Body.transformToByteArray();

	const { output } = await generateText({
		model: neon(MODEL),
		instructions:
			"You write alt text and search tags for images that users upload. Describe only what is visible, and say when something is unclear instead of guessing.",
		output: Output.object({ schema: descriptionSchema }),
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: "Write alt text and tags for this image." },
					{ type: "file", mediaType, data: bytes },
				],
			},
		],
	});

	const description = {
		etag,
		contentType: mediaType,
		sizeBytes: size,
		altText: output.altText,
		tags: output.tags,
		visibleText: output.visibleText,
		model: MODEL,
	};
	const [row] = await db
		.insert(imageDescriptions)
		.values({ bucket, key, ...description })
		.onConflictDoUpdate({
			target: [imageDescriptions.bucket, imageDescriptions.key],
			set: { ...description, describedAt: new Date() },
		})
		.returning({
			bucket: imageDescriptions.bucket,
			key: imageDescriptions.key,
			altText: imageDescriptions.altText,
			tags: imageDescriptions.tags,
			visibleText: imageDescriptions.visibleText,
			model: imageDescriptions.model,
			describedAt: imageDescriptions.describedAt,
		});

	return Response.json({ status: "described", ...row });
}

export default {
	async fetch(request: Request): Promise<Response> {
		const { pathname } = new URL(request.url);

		if (pathname === "/") {
			if (request.method !== "GET") {
				return new Response(null, { status: 405, headers: { Allow: "GET" } });
			}
			return Response.json({ name: "Alt text for uploaded images", table: "image_descriptions", routes: ROUTES });
		}

		if (pathname !== "/object") {
			return Response.json({ error: "Not found", routes: ROUTES }, { status: 404 });
		}
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		const parsed = await parseTriggerDelivery(request);
		if (!parsed.ok) {
			return Response.json({ error: parsed.error }, { status: parsed.error === "invalid_body" ? 400 : 401 });
		}

		const invocation = parsed.invocation;
		if (invocation.type !== "storage_object_created") {
			return Response.json(
				{ error: "This route only handles storage_object_created triggers" },
				{ status: 400 },
			);
		}

		const { bucketName, objectKey } = invocation.data;
		try {
			return await describeObject(bucketName, objectKey);
		} catch (error) {
			console.error(`[upload-alt-text] could not describe ${bucketName}/${objectKey}:`, error);
			return Response.json({ error: "Could not describe the image" }, { status: 502 });
		}
	},
};
