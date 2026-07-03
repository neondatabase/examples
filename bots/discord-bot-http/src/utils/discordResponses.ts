import {
  DISCORD_DB_RESPONSE_DEADLINE_MS,
  DISCORD_EMBED_COLORS,
  DISCORD_EPOCH_MS,
  DISCORD_MESSAGE_FLAGS,
} from "../constants/discord.js";
import type { DiscordEmbedResponseInput, DiscordInteraction, DiscordInteractionResponseData } from "../types/discord.js";

export const getEphemeralFlag = (ephemeral: boolean): number | undefined =>
  ephemeral ? DISCORD_MESSAGE_FLAGS.EPHEMERAL : undefined;

const getDiscordSnowflakeTimestampMs = (snowflake: string | undefined): number | undefined => {
  if (!snowflake) {
    return undefined;
  }

  try {
    return Number((BigInt(snowflake) >> 22n) + DISCORD_EPOCH_MS);
  } catch {
    return undefined;
  }
};

const getInteractionLatencyMs = (interactionId: string | undefined): number | undefined => {
  const timestampMs = getDiscordSnowflakeTimestampMs(interactionId);

  if (timestampMs === undefined) {
    return undefined;
  }

  return Math.max(0, Date.now() - timestampMs);
};

const formatLatency = (latencyMs: number | undefined): string =>
  latencyMs === undefined ? "latency unavailable" : `**${latencyMs}**ms latency`;

export const createEmbedResponseData = ({
  embed,
  ephemeral,
  allowedMentions = false,
}: DiscordEmbedResponseInput): DiscordInteractionResponseData => {
  const embedData = { ...embed };
  delete embedData.color;

  return {
    embeds: [
      {
        ...embedData,
        color: DISCORD_EMBED_COLORS.PRIMARY,
        timestamp: new Date().toISOString(),
      },
    ],
    flags: getEphemeralFlag(ephemeral),
    ...(allowedMentions ? { allowed_mentions: { parse: [] } } : {}),
  };
};

export const createErrorResponseData = (description: string): DiscordInteractionResponseData =>
  createEmbedResponseData({
    embed: {
      title: "Something went wrong",
      description,
    },
    ephemeral: true,
  });

export const withResponseDeadline = (
  work: Promise<DiscordInteractionResponseData>,
  fallback: () => DiscordInteractionResponseData,
): Promise<DiscordInteractionResponseData> => {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<DiscordInteractionResponseData>((resolve) => {
    timer = setTimeout(() => resolve(fallback()), DISCORD_DB_RESPONSE_DEADLINE_MS);
  });

  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
};

export const createWarmingUpResponseData = (): DiscordInteractionResponseData =>
  createEmbedResponseData({
    embed: {
      title: "Warming up",
      description:
        "The database is warming up (Neon scales to zero when idle). Please run the command again in a moment.",
    },
    ephemeral: true,
  });

export const createPingResponseData = (payload: DiscordInteraction, ephemeral: boolean): DiscordInteractionResponseData =>
  createEmbedResponseData({
    embed: {
      title: "Pong",
      description: `Neon Functions replied with ${formatLatency(getInteractionLatencyMs(payload.id))}.`,
    },
    ephemeral,
  });
