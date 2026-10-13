import { z } from "zod";

// Server function inputs. Safe to import in the browser. Unknown keys are
// stripped, so a row's `userId` can never come from the browser.
const title = z.string().trim().min(1).max(200);

// The user the page was loaded for. The server only compares it with the
// session's user, and rows are always written for the session's user.
export const pageUserInput = z.object({ userId: z.string() });

// Each write sends one transaction's batch, plus the page's user.
const fromPage = <T extends z.ZodType>(batch: T) =>
  pageUserInput.extend({ batch });

export const newTodosInput = fromPage(
  z
    .array(z.object({ id: z.uuid(), title, completed: z.boolean() }))
    .min(1)
    .max(100),
);

export const todoUpdatesInput = fromPage(
  z
    .array(
      z.object({
        id: z.uuid(),
        changes: z.object({ title, completed: z.boolean() }).partial(),
      }),
    )
    .min(1)
    .max(100),
);

export const todoIdsInput = fromPage(z.array(z.uuid()).min(1).max(100));
