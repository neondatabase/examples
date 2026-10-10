// Pure parsing of a Mastra message's stored `content` into its tool invocations.

// The stored shapes: `state: "call"` while the tool runs, and
// for good if the run's abort cut it off; `state: "result"` with the result
// (an expected failure is `{ ok: false, error }`, and input the tool's
// schema rejected is `{ error: true, message }`); and `state: "output-error"`
// with `errorText` when the tool threw. `args` and `result` are the clipped
// copies from the tool's transcript transform, not what the model got.
export interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  state: string;
  args: unknown;
  result: unknown;
  // Why the call failed, when the tool threw: Mastra saves that as
  // `errorText` with no `result`. A research tool's expected failures
  // are ordinary results instead, so this is null for them.
  error: string | null;
}

export interface ParsedMessage {
  id: string;
  createdAt: Date | null;
  toolInvocations: ToolInvocation[];
}

interface MessageContent {
  toolInvocations: ToolInvocation[];
}

// `content` is Mastra's format 2 JSON in a text column. Each tool call sits in
// a `tool-invocation` part of an assistant message, which Mastra updates in
// place when the result arrives. Content that doesn't parse has no tool calls,
// so this never throws.
export function parseMessageContent(content: string): MessageContent {
  try {
    return { toolInvocations: readToolInvocations(asRecord(JSON.parse(content))?.parts) };
  } catch {
    return { toolInvocations: [] };
  }
}

function readToolInvocations(parts: unknown): ToolInvocation[] {
  if (!Array.isArray(parts)) return [];
  const invocations: ToolInvocation[] = [];
  for (const part of parts) {
    const record = asRecord(part);
    if (record?.type !== "tool-invocation") continue;
    const invocation = readInvocation(record.toolInvocation);
    if (invocation) invocations.push(invocation);
  }
  return invocations;
}

// An invocation without a tool name can't be matched to a step, so drop it.
function readInvocation(value: unknown): ToolInvocation | null {
  const record = asRecord(value);
  const toolName = asString(record?.toolName);
  if (!record || toolName === "") return null;
  return {
    toolCallId: asString(record.toolCallId),
    toolName,
    state: asString(record.state),
    args: record.args,
    result: record.result,
    error: readError(record),
  };
}

// Mastra saves a thrown tool error as `state: "output-error"` with
// `errorText`. Its legacy shape is `state: "result"` with `isError` and the
// text as the result, so read that too. `errorText` is a string when the
// tool's transcript transform sets its error phase; without one, Mastra
// stores `{ message: "Tool error payload unavailable" }` instead.
function readError(record: Record<string, unknown>): string | null {
  const errorText = (asString(record.errorText) || asString(asRecord(record.errorText)?.message)).trim();
  if (errorText !== "") return errorText;
  if (record.isError === true || record.state === "output-error") {
    const result = typeof record.result === "string" ? record.result.trim() : "";
    return result !== "" ? result : "Tool call failed";
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
