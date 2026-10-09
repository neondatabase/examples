import { z } from "zod";

export class InputError extends Error {}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new InputError(result.error.issues[0]?.message ?? "invalid input");
  }
  return result.data;
}

const documentIdSchema = z
  .string({ error: "id must be 1–128 URL-safe characters" })
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, {
    error: "id must be 1–128 URL-safe characters",
  });

function searchableText(name: string) {
  const message = name + " must be 1–20000 characters";
  return z
    .string({ error: message })
    .max(20_000, { error: message })
    .trim()
    .min(1, { error: message });
}

function jsonFields(name: string) {
  return z
    .record(z.string(), z.unknown(), {
      error: name + " must be a JSON object",
    })
    .refine((value) => JSON.stringify(value).length <= 16_000, {
      error: name + " is too large (max 16000 characters)",
    });
}

const metadataSchema = jsonFields("metadata");
const removedKeysMessage =
  "removeMetadataKeys must be an array of at most 100 short strings";
const removeMetadataKeysSchema = z
  .array(
    z
      .string({ error: removedKeysMessage })
      .min(1, { error: removedKeysMessage })
      .max(128, { error: removedKeysMessage }),
    { error: removedKeysMessage },
  )
  .max(100, { error: removedKeysMessage });

const putSchema = z.strictObject(
  {
    content: searchableText("content"),
    metadata: metadataSchema.default({}),
  },
  {
    error: (issue) =>
      issue.code === "invalid_type" ? "body must be a JSON object" : undefined,
  },
);

const patchSchema = z
  .strictObject(
    {
      content: searchableText("content").optional(),
      metadata: metadataSchema.optional(),
      removeMetadataKeys: removeMetadataKeysSchema.optional(),
    },
    {
      error: (issue) =>
        issue.code === "invalid_type"
          ? "body must be a JSON object"
          : undefined,
    },
  )
  .refine(
    (body) =>
      body.content !== undefined ||
      body.metadata !== undefined ||
      body.removeMetadataKeys !== undefined,
    { error: "provide content, metadata, or removeMetadataKeys" },
  )
  .transform((body) => ({
    content: body.content ?? null,
    metadata: body.metadata ?? {},
    removeMetadataKeys: body.removeMetadataKeys ?? [],
  }));

const limitMessage = "limit must be an integer from 1 to 20";
const candidatesMessage = "candidates must be an integer between limit and 100";
const rrfKMessage = "rrfK must be an integer from 1 to 200";

const searchSchema = z
  .strictObject(
    {
      query: searchableText("query"),
      filter: jsonFields("filter").default({}),
      mode: z
        .enum(["hybrid", "vector", "keyword"], {
          error: "mode must be hybrid, vector, or keyword",
        })
        .default("hybrid"),
      limit: z
        .number({ error: limitMessage })
        .int({ error: limitMessage })
        .min(1, { error: limitMessage })
        .max(20, { error: limitMessage })
        .default(10),
      candidates: z
        .number({ error: candidatesMessage })
        .int({ error: candidatesMessage })
        .max(100, { error: candidatesMessage })
        .default(40),
      rrfK: z
        .number({ error: rrfKMessage })
        .int({ error: rrfKMessage })
        .min(1, { error: rrfKMessage })
        .max(200, { error: rrfKMessage })
        .default(60),
    },
    {
      error: (issue) =>
        issue.code === "invalid_type"
          ? "body must be a JSON object"
          : undefined,
    },
  )
  .refine((body) => body.candidates >= body.limit, {
    path: ["candidates"],
    error: candidatesMessage,
  });

export function documentId(value: unknown): string {
  return parse(documentIdSchema, value);
}

export function parsePut(value: unknown) {
  return parse(putSchema, value);
}

export function parsePatch(value: unknown) {
  return parse(patchSchema, value);
}

export function parseSearch(value: unknown) {
  return parse(searchSchema, value);
}

export function validateVector(value: number[]): number[] {
  if (value.length !== 1024 || value.some((n) => !Number.isFinite(n))) {
    throw new Error("Gateway returned an invalid 1024-dimensional embedding");
  }
  return value;
}
