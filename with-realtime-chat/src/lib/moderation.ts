import { z } from 'zod';
import { mastra } from '../mastra';

const moderationSchema = z.object({
  flagged: z.boolean(),
  reason: z.string(),
});

export type Moderation = z.infer<typeof moderationSchema>;

// Classify a message with the moderation agent. Fails OPEN (never flags) on any
// error so a moderation hiccup can't delete legitimate messages.
export async function moderateMessage(body: string): Promise<Moderation> {
  if (!body.trim()) return { flagged: false, reason: '' };
  try {
    const res = await mastra.getAgent('moderator').generate(`Moderate this chat message:\n"${body}"`, {
      structuredOutput: { schema: moderationSchema, jsonPromptInjection: true },
      abortSignal: AbortSignal.timeout(15_000),
    });
    return res.object ?? { flagged: false, reason: '' };
  } catch (error) {
    console.error('[moderation] failed (allowing message):', error);
    return { flagged: false, reason: '' };
  }
}
