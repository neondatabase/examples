import { truncate } from "~/lib/format";

// Pure, with no server-only imports, so it can be unit tested without a
// database.

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

// A failed model call's message can be just the HTTP status text, such as
// "Too Many Requests". The gateway gives its reason in the JSON body, such as
// {"error_code":"REQUEST_LIMIT_EXCEEDED","message":"..."}, so this keeps the
// status, the code, and the first sentence of the message. The lead's failure
// detail is short, and the later sentences can carry links.
export function modelCallError(error: Error): Error {
  const { statusCode, responseBody } = error as { statusCode?: unknown; responseBody?: unknown };
  if (typeof responseBody !== "string") return error;
  let body: Record<string, unknown> | null = null;
  try {
    body = asRecord(JSON.parse(responseBody));
  } catch {
    // Not JSON, such as a proxy's HTML error page.
  }
  // OpenAI-style bodies nest the reason under `error`.
  const reason = asRecord(body?.error) ?? body;
  const code = [reason?.error_code, reason?.code, reason?.type].find((value) => typeof value === "string");
  const message = typeof reason?.message === "string"
    ? reason.message.replace(/\bhttps?:\/\/\S+/g, "").split(/(?<=\.)\s/)[0].trim()
    : "";
  const detail = [code, message].filter(Boolean).join(": ");
  if (!detail) return error;
  const status = typeof statusCode === "number" ? `${statusCode} ` : "";
  // The runner prefixes "Extraction failed: " and cuts the whole at 160.
  return new Error(truncate(`${status}${detail}`, 140), { cause: error });
}
