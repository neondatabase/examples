import { isNotFound, isRedirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import type { z } from "zod";

// What a failed server function tells the user. TanStack Start sends a thrown
// error to the browser as its message alone, without the stack, and the UI
// shows that message. So an error meant for the user is a `UserError` holding
// one short sentence. `userErrors` replaces any other error with a generic
// message, because a database error's message holds the SQL and its
// parameters.

export class UserError extends Error {
  override readonly name = "UserError";
}

// The first middleware of every server function the UI writes through. Start
// doesn't log an error a handler throws, so the original is logged here.
export const userErrors = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Router control flow (a sign-in redirect, a not-found) passes through.
    if (error instanceof UserError || isRedirect(error) || isNotFound(error)) throw error;
    console.error("[server function] failed", error);
    throw new Error("Something went wrong. Try again.");
  }
});

// A `.validator()` that rejects input with its first problem as a sentence.
export function parseWith<T>(schema: z.ZodType<T>) {
  return (input: unknown): T => {
    const result = schema.safeParse(input);
    if (result.success) return result.data;
    throw new UserError(describeIssue(result.error.issues[0]));
  };
}

// A custom message is written for the user. Zod's built-in ones don't say
// which field they mean, so they gain the field's label.
export function describeIssue(issue: z.core.$ZodIssue | undefined): string {
  if (issue === undefined) return "Invalid input";
  if (issue.code === "custom") return issue.message;
  const field = issue.path.findLast((part) => typeof part === "string");
  return field === undefined ? issue.message : `${fieldLabel(field)}: ${issue.message}`;
}

// "foundedYear" becomes "Founded year", and "profileUrl" "Profile URL".
function fieldLabel(key: string): string {
  const words = key
    .split(/(?=[A-Z])/)
    .map((word) => (/^(id|url)$/i.test(word) ? word.toUpperCase() : word.toLowerCase()));
  const label = words.join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
