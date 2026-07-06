import * as z from "zod";

const whatsAppTextMessageSchema = z
  .object({
    body: z.string(),
  })
  .passthrough();

const whatsAppButtonReplySchema = z
  .object({
    id: z.string(),
    title: z.string().optional(),
  })
  .passthrough();

const whatsAppInteractiveMessageSchema = z
  .object({
    type: z.string(),
    button_reply: whatsAppButtonReplySchema.optional(),
  })
  .passthrough();

export const whatsAppMessageSchema = z
  .object({
    from: z.string(),
    id: z.string().optional(),
    timestamp: z.string().optional(),
    type: z.string(),
    text: whatsAppTextMessageSchema.optional(),
    interactive: whatsAppInteractiveMessageSchema.optional(),
  })
  .passthrough();

const whatsAppValueSchema = z
  .object({
    messaging_product: z.literal("whatsapp").optional(),
    messages: z.array(whatsAppMessageSchema).optional(),
  })
  .passthrough();

const whatsAppChangeSchema = z
  .object({
    field: z.string().optional(),
    value: whatsAppValueSchema.optional(),
  })
  .passthrough();

const whatsAppEntrySchema = z
  .object({
    id: z.string().optional(),
    changes: z.array(whatsAppChangeSchema).optional(),
  })
  .passthrough();

export const whatsAppWebhookPayloadSchema = z
  .object({
    object: z.string().optional(),
    entry: z.array(whatsAppEntrySchema).optional(),
  })
  .passthrough();

const whatsAppApiContactSchema = z
  .object({
    input: z.string().optional(),
    wa_id: z.string().optional(),
  })
  .passthrough();

const whatsAppApiMessageSchema = z
  .object({
    id: z.string().optional(),
  })
  .passthrough();

export const whatsAppApiResponseSchema = z
  .object({
    messaging_product: z.literal("whatsapp").optional(),
    contacts: z.array(whatsAppApiContactSchema).optional(),
    messages: z.array(whatsAppApiMessageSchema).optional(),
    success: z.boolean().optional(),
  })
  .passthrough();
