import * as z from "zod";

export const telegramChatIdSchema = z.union([z.number().int(), z.string()]);

const telegramUserSchema = z
  .object({
    id: z.number().int(),
    is_bot: z.boolean().optional(),
    first_name: z.string().optional(),
    username: z.string().optional(),
  })
  .passthrough();

const telegramChatSchema = z
  .object({
    id: telegramChatIdSchema,
    type: z.string().optional(),
  })
  .passthrough();

export const telegramMessageSchema = z
  .object({
    message_id: z.number().int(),
    date: z.number().int().optional(),
    text: z.string().optional(),
    from: telegramUserSchema.optional(),
    chat: telegramChatSchema,
  })
  .passthrough();

export const telegramCallbackQuerySchema = z
  .object({
    id: z.string(),
    from: telegramUserSchema,
    data: z.string().optional(),
    message: telegramMessageSchema.optional(),
  })
  .passthrough();

export const telegramUpdateSchema = z
  .object({
    update_id: z.number().int(),
    message: telegramMessageSchema.optional(),
    callback_query: telegramCallbackQuerySchema.optional(),
  })
  .passthrough();

export const telegramApiResponseSchema = z
  .object({
    ok: z.boolean(),
    result: z.unknown().optional(),
    description: z.string().optional(),
  })
  .passthrough();
