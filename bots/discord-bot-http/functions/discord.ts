import {
  DISCORD_BUTTONS_COMMAND_NAME,
  DISCORD_EMBED_COLORS,
  DISCORD_EPHEMERAL_OPTION_NAME,
  DISCORD_HELP_COMMAND_NAME,
  DISCORD_INFO_COMMAND_NAME,
  DISCORD_INTERACTIONS_PATH,
  DISCORD_INTERACTION_TYPES,
  DISCORD_MESSAGE_FLAGS,
  DISCORD_NAME_COMMAND_NAME,
  DISCORD_NAME_OPTION_NAME,
  DISCORD_PING_COMMAND_NAME,
  DISCORD_PROFILE_COMMAND_NAME,
  DISCORD_RESPONSE_TYPES,
} from "../src/constants/discord.js";
import { discordInteractionSchema } from "../src/schemas/discord.js";
import type { DiscordEmbed, DiscordInteraction, DiscordInteractionResponseData } from "../src/types/discord.js";
import {
  createButtonTestClickResponseData,
  createButtonTestResponseData,
  createHelpResponseData,
  createInfoResponseData,
  createProfileResponseData,
  parseButtonTestCustomId,
} from "../src/utils/generalComponents.js";
import { getRegisteredDiscordCommandMentions } from "../src/utils/discordApi.js";
import { getDiscordInteractionUserId } from "../src/utils/getDiscordInteractionUserId.js";
import { jsonResponse } from "../src/utils/jsonResponse.js";
import { getCommandUsage, getStoredName, setStoredName, trackCommandRun } from "../src/utils/userNames.js";
import { verifyDiscordRequest } from "../src/utils/verifyDiscordRequest.js";

const DISCORD_EPOCH_MS = 1_420_070_400_000n;

const getBooleanCommandOption = (
  options: NonNullable<NonNullable<DiscordInteraction["data"]>["options"]>,
  name: string,
): boolean => options.find((option) => option.name === name)?.value === true;

const getStringCommandOption = (
  options: NonNullable<NonNullable<DiscordInteraction["data"]>["options"]>,
  name: string,
): string | undefined => {
  const value = options.find((option) => option.name === name)?.value;

  return typeof value === "string" ? value : undefined;
};

const getEphemeralFlag = (ephemeral: boolean): number | undefined =>
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

const createEmbedResponseData = ({
  embed,
  ephemeral,
  allowedMentions = false,
}: {
  embed: DiscordEmbed;
  ephemeral: boolean;
  allowedMentions?: boolean;
}): DiscordInteractionResponseData => {
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

const createErrorResponseData = (description: string): DiscordInteractionResponseData =>
  createEmbedResponseData({
    embed: {
      title: "Something went wrong",
      description,
    },
    ephemeral: true,
  });

const DB_RESPONSE_DEADLINE_MS = 2500;

const withResponseDeadline = (
  work: Promise<DiscordInteractionResponseData>,
  fallback: () => DiscordInteractionResponseData,
): Promise<DiscordInteractionResponseData> => {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<DiscordInteractionResponseData>((resolve) => {
    timer = setTimeout(() => resolve(fallback()), DB_RESPONSE_DEADLINE_MS);
  });

  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
};

const createWarmingUpResponseData = (): DiscordInteractionResponseData =>
  createEmbedResponseData({
    embed: {
      title: "Warming up",
      description:
        "The database is warming up (Neon scales to zero when idle). Please run the command again in a moment.",
    },
    ephemeral: true,
  });

const createPingResponseData = (payload: DiscordInteraction, ephemeral: boolean): DiscordInteractionResponseData =>
  createEmbedResponseData({
    embed: {
      title: "Pong",
      description: `Neon Functions replied with ${formatLatency(getInteractionLatencyMs(payload.id))}.`,
    },
    ephemeral,
  });

const createNameCommandResponse = async (
  payload: DiscordInteraction,
  name: string | undefined,
  ephemeral: boolean,
) => {
  const userId = getDiscordInteractionUserId(payload);

  if (!userId) {
    return createErrorResponseData("Could not identify your Discord user for the `/name` command.");
  }

  try {
    const trimmedName = name?.trim();

    if (trimmedName) {
      await setStoredName(userId, trimmedName);

      return createEmbedResponseData({
        embed: {
          title: "Name Saved",
          description: `Saved your name as **${trimmedName}**.`,
        },
        ephemeral,
        allowedMentions: true,
      });
    }

    const storedName = await getStoredName(userId);

    return createEmbedResponseData({
      embed: {
        title: "Stored Name",
        description: storedName
          ? `Your stored name is **${storedName}**.`
          : "You do not have a stored name yet. Run `/name name:<your name>` to save one.",
      },
      ephemeral,
      allowedMentions: true,
    });
  } catch (error) {
    console.error("Name command failed.", error);

    return createErrorResponseData("The `/name` command could not reach the Neon database.");
  }
};

const trackApplicationCommandRun = async (payload: DiscordInteraction): Promise<void> => {
  if (payload.type !== DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND || !payload.data?.name) {
    return;
  }

  const userId = getDiscordInteractionUserId(payload);

  if (!userId) {
    return;
  }

  try {
    await trackCommandRun(userId, payload.data.name);
  } catch (error) {
    console.error("Command usage tracking failed.", error);
  }
};

const getCommandMentions = async (payload: DiscordInteraction): Promise<Record<string, string>> => {
  const applicationId = process.env.DISCORD_APPLICATION_ID ?? payload.application_id;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!applicationId || !botToken) {
    return {};
  }

  try {
    return await getRegisteredDiscordCommandMentions({
      applicationId,
      botToken,
      guildId: process.env.DISCORD_GUILD_ID,
    });
  } catch (error) {
    console.error("Discord command mention lookup failed.", error);
    return {};
  }
};

const createProfileCommandResponse = async (payload: DiscordInteraction, ephemeral: boolean) => {
  const userId = getDiscordInteractionUserId(payload);

  if (!userId) {
    return createErrorResponseData("Could not identify your Discord user for the `/profile` command.");
  }

  try {
    const [storedName, commandUsage] = await Promise.all([getStoredName(userId), getCommandUsage(userId)]);
    const sortedCommandUsage = [...commandUsage].sort((first, second) =>
      first.commandName.localeCompare(second.commandName),
    );
    const totalRuns = sortedCommandUsage.reduce((total, usage) => total + usage.runCount, 0);
    const usageLines =
      sortedCommandUsage.length > 0
        ? sortedCommandUsage.map((usage) => `- \`/${usage.commandName}\`: ${usage.runCount}`)
        : ["- No command usage tracked yet."];

    return createProfileResponseData({
      ephemeral,
      name: storedName,
      totalRuns,
      usageLines,
    });
  } catch (error) {
    console.error("Profile command failed.", error);

    return createErrorResponseData("The `/profile` command could not reach the Neon database.");
  }
};

type CommandContext = {
  payload: DiscordInteraction;
  request: Request;
  url: URL;
  ephemeral: boolean;
  options: NonNullable<NonNullable<DiscordInteraction["data"]>["options"]>;
};

type CommandHandler = (
  context: CommandContext,
) => DiscordInteractionResponseData | Promise<DiscordInteractionResponseData>;

const commandHandlers: Record<string, CommandHandler> = {
  [DISCORD_PING_COMMAND_NAME]: ({ payload, ephemeral }) => createPingResponseData(payload, ephemeral),
  [DISCORD_INFO_COMMAND_NAME]: ({ request, url, ephemeral }) =>
    createInfoResponseData({
      branch: process.env.NEON_BRANCH ?? "not set",
      ephemeral,
      functionUrl: `${url.origin}${DISCORD_INTERACTIONS_PATH}`,
      method: request.method,
      platform: `${process.platform} ${process.arch}`,
      runtime: `Node.js ${process.version}`,
    }),
  [DISCORD_HELP_COMMAND_NAME]: async ({ payload, ephemeral }) =>
    createHelpResponseData(ephemeral, await getCommandMentions(payload)),
  [DISCORD_BUTTONS_COMMAND_NAME]: ({ ephemeral }) => createButtonTestResponseData(ephemeral),
  [DISCORD_NAME_COMMAND_NAME]: ({ payload, options, ephemeral }) =>
    withResponseDeadline(
      createNameCommandResponse(payload, getStringCommandOption(options, DISCORD_NAME_OPTION_NAME), ephemeral),
      createWarmingUpResponseData,
    ),
  [DISCORD_PROFILE_COMMAND_NAME]: ({ payload, ephemeral }) =>
    withResponseDeadline(createProfileCommandResponse(payload, ephemeral), createWarmingUpResponseData),
};

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  switch (request.method) {
    case "GET":
      return jsonResponse({
        ok: true,
        service: "discord-interactions",
        interactionsPath: DISCORD_INTERACTIONS_PATH,
        interactionsUrl: `${url.origin}${DISCORD_INTERACTIONS_PATH}`,
      });
    case "POST":
      break;
    default:
      return jsonResponse({ error: "method not allowed" }, { status: 405 });
  }

  const body = await request.text();
  const isVerified = verifyDiscordRequest({
    body,
    publicKey: process.env.DISCORD_PUBLIC_KEY,
    signature: request.headers.get("x-signature-ed25519"),
    timestamp: request.headers.get("x-signature-timestamp"),
  });

  if (!isVerified) {
    return jsonResponse({ error: "invalid request signature" }, { status: 401 });
  }

  let payloadBody: unknown;

  try {
    payloadBody = JSON.parse(body);
  } catch {
    return jsonResponse({ error: "invalid json" }, { status: 400 });
  }

  const parsedPayload = discordInteractionSchema.safeParse(payloadBody);

  if (!parsedPayload.success) {
    return jsonResponse({ error: "invalid interaction payload" }, { status: 400 });
  }

  const payload = parsedPayload.data;
  const options = payload.data?.options ?? [];
  const ephemeral = getBooleanCommandOption(options, DISCORD_EPHEMERAL_OPTION_NAME);

  if (payload.type === DISCORD_INTERACTION_TYPES.PING) {
    return jsonResponse({ type: DISCORD_RESPONSE_TYPES.PONG });
  }

  if (payload.type === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND && payload.data?.name) {
    const commandHandler = commandHandlers[payload.data.name];

    if (commandHandler) {
      void trackApplicationCommandRun(payload);

      return jsonResponse({
        type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
        data: await commandHandler({ payload, request, url, ephemeral, options }),
      });
    }
  }

  if (payload.type === DISCORD_INTERACTION_TYPES.MESSAGE_COMPONENT && payload.data?.custom_id) {
    const buttonTestAction = parseButtonTestCustomId(payload.data.custom_id);

    if (buttonTestAction) {
      return jsonResponse({
        type: DISCORD_RESPONSE_TYPES.UPDATE_MESSAGE,
        data: createButtonTestClickResponseData(buttonTestAction),
      });
    }

    return jsonResponse({
      type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
      data: createErrorResponseData("That button is not handled by this bot."),
    });
  }

  return jsonResponse({
    type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
    data: createErrorResponseData("Unknown command. Try `/help`."),
  });
}
