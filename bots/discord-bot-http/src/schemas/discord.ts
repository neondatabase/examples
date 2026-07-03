import * as z from "zod";

export const discordSnowflakeSchema = z.string().regex(/^\d+$/);

const discordCommandOptionSchema = z.object({
  name: z.string(),
  type: z.number().int(),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const registerDiscordCommandsInputSchema = z.object({
  applicationId: discordSnowflakeSchema,
  botToken: z.string().min(1),
  guildId: discordSnowflakeSchema.optional(),
});

export const discordInteractionSchema = z.object({
  application_id: discordSnowflakeSchema.optional(),
  guild_id: discordSnowflakeSchema.optional(),
  id: discordSnowflakeSchema.optional(),
  type: z.number().int(),
  data: z
    .object({
      name: z.string().optional(),
      custom_id: z.string().optional(),
      component_type: z.number().int().optional(),
      options: z.array(discordCommandOptionSchema).optional(),
    })
    .optional(),
  member: z
    .object({
      user: z
        .object({
          id: discordSnowflakeSchema.optional(),
        })
        .optional(),
    })
    .optional(),
  user: z
    .object({
      id: discordSnowflakeSchema.optional(),
    })
    .optional(),
});

export const discordApplicationCommandSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: z.number().int(),
  options: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        type: z.number().int(),
        required: z.boolean().optional(),
        min_length: z.number().int().optional(),
        max_length: z.number().int().optional(),
      }),
    )
    .optional(),
});

export const registeredDiscordCommandSchema = z.object({
  id: discordSnowflakeSchema,
  name: z.string(),
});

export const registeredDiscordCommandsSchema = z.array(registeredDiscordCommandSchema);

export const discordInteractionResponseDataSchema = z.object({
  content: z.string().optional(),
  embeds: z.array(z.unknown()).optional(),
  flags: z.number().int().optional(),
  allowed_mentions: z.unknown().optional(),
  components: z.array(z.unknown()).optional(),
});
