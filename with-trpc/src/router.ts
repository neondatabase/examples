import { eq } from "drizzle-orm";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { getDb } from "./db/client.js";
import { todos } from "./db/schema.js";

export type Context = {
  db: ReturnType<typeof getDb>;
};

const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
  list: t.procedure.query(async ({ ctx }) => {
    return ctx.db.select().from(todos);
  }),

  byId: t.procedure.input(z.number().int().positive()).query(async ({ ctx, input }) => {
    const [row] = await ctx.db.select().from(todos).where(eq(todos.id, input));
    if (!row) {
      throw new TRPCError({ code: "NOT_FOUND", message: `No todo with id ${input}` });
    }
    return row;
  }),

  create: t.procedure
    .input(z.object({ text: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.insert(todos).values({ text: input.text }).returning();
      return row;
    }),

  delete: t.procedure.input(z.number().int().positive()).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db.delete(todos).where(eq(todos.id, input)).returning();
    if (!row) {
      throw new TRPCError({ code: "NOT_FOUND", message: `No todo with id ${input}` });
    }
    return row;
  }),
});

export type AppRouter = typeof appRouter;
