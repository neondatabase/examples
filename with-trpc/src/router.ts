import { initTRPC, TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { todos } from './db/schema';

const t = initTRPC.context<{ db: NodePgDatabase }>().create();

const todoId = z.number().int().positive();

function notFound(id: number) {
  return new TRPCError({ code: 'NOT_FOUND', message: `No todo with id ${id}` });
}

export const appRouter = t.router({
  list: t.procedure.query(({ ctx }) => ctx.db.select().from(todos)),

  byId: t.procedure.input(todoId).query(async ({ ctx, input }) => {
    const [todo] = await ctx.db.select().from(todos).where(eq(todos.id, input));
    if (!todo) throw notFound(input);
    return todo;
  }),

  create: t.procedure
    .input(z.object({ text: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [todo] = await ctx.db.insert(todos).values({ text: input.text }).returning();
      return todo;
    }),

  delete: t.procedure.input(todoId).mutation(async ({ ctx, input }) => {
    const [todo] = await ctx.db.delete(todos).where(eq(todos.id, input)).returning();
    if (!todo) throw notFound(input);
    return todo;
  }),
});

export type AppRouter = typeof appRouter;
