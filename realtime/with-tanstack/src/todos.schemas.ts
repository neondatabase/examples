import { z } from "zod";

// Server function inputs, safe to import in the browser. Each write sends one
// transaction's batch, and `requireUser` checks the page's `userId`. Unknown
// keys are stripped, so a row's `userId` can never come from the browser.
const title = z.string().trim().min(1).max(200);

export const newTodosInput = z.object({
  batch: z
    .array(z.object({ id: z.uuid(), title, completed: z.boolean() }))
    .min(1)
    .max(100),
});

export const todoUpdatesInput = z.object({
  batch: z
    .array(
      z.object({
        id: z.uuid(),
        changes: z.object({ title, completed: z.boolean() }).partial(),
      }),
    )
    .min(1)
    .max(100),
});

export const todoIdsInput = z.object({
  batch: z.array(z.uuid()).min(1).max(100),
});
