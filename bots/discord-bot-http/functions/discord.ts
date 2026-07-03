import {
  DISCORD_BUTTONS_COMMAND_NAME,
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
import type { DiscordInteraction } from "../src/types/discord.js";
import {
  createButtonTestClickResponseData,
  createButtonTestResponseData,
  createHelpResponseData,
  parseButtonTestCustomId,
} from "../src/utils/generalComponents.js";
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
  latencyMs === undefined ? "latency unavailable" : `${latencyMs}ms latency`;

const createInfoContent = (request: Request, url: URL): string =>
  [
    "Neon Discord Bot info",
    `Runtime: Node.js ${process.version}`,
    `Platform: ${process.platform} ${process.arch}`,
    `Function URL: ${url.origin}${DISCORD_INTERACTIONS_PATH}`,
    `Method: ${request.method}`,
    `Neon branch: ${process.env.NEON_BRANCH ?? "not set"}`,
  ].join("\n");

const createNameCommandResponse = async (
  payload: DiscordInteraction,
  name: string | undefined,
  ephemeral: boolean,
) => {
  const userId = getDiscordInteractionUserId(payload);

  if (!userId) {
    return {
      content: "Could not identify your Discord user for the `/name` command.",
      flags: DISCORD_MESSAGE_FLAGS.EPHEMERAL,
    };
  }

  try {
    const trimmedName = name?.trim();

    if (trimmedName) {
      await setStoredName(userId, trimmedName);

      return {
        content: `Saved your name as **${trimmedName}**.`,
        flags: getEphemeralFlag(ephemeral),
        allowed_mentions: { parse: [] },
      };
    }

    const storedName = await getStoredName(userId);

    return {
      content: storedName
        ? `Your stored name is **${storedName}**.`
        : "You do not have a stored name yet. Run `/name name:<your name>` to save one.",
      flags: getEphemeralFlag(ephemeral),
      allowed_mentions: { parse: [] },
    };
  } catch (error) {
    console.error("Name command failed.", error);

    return {
      content: "The `/name` command could not reach the Neon database.",
      flags: DISCORD_MESSAGE_FLAGS.EPHEMERAL,
    };
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

const createProfileCommandResponse = async (payload: DiscordInteraction, ephemeral: boolean) => {
  const userId = getDiscordInteractionUserId(payload);

  if (!userId) {
    return {
      content: "Could not identify your Discord user for the `/profile` command.",
      flags: DISCORD_MESSAGE_FLAGS.EPHEMERAL,
    };
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

    return {
      content: [
        "### Your Profile",
        `Name: ${storedName ? `**${storedName}**` : "not set"}`,
        `Total commands run: ${totalRuns}`,
        "",
        "Command usage:",
        ...usageLines,
      ].join("\n"),
      flags: getEphemeralFlag(ephemeral),
      allowed_mentions: { parse: [] },
    };
  } catch (error) {
    console.error("Profile command failed.", error);

    return {
      content: "The `/profile` command could not reach the Neon database.",
      flags: DISCORD_MESSAGE_FLAGS.EPHEMERAL,
    };
  }
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
  const name = getStringCommandOption(options, DISCORD_NAME_OPTION_NAME);

  if (payload.type === DISCORD_INTERACTION_TYPES.PING) {
    return jsonResponse({ type: DISCORD_RESPONSE_TYPES.PONG });
  }

  await trackApplicationCommandRun(payload);

  if (
    payload.type === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND &&
    payload.data?.name === DISCORD_PING_COMMAND_NAME
  ) {
    return jsonResponse({
      type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `Pong from Neon Functions (${formatLatency(getInteractionLatencyMs(payload.id))}).`,
        flags: getEphemeralFlag(ephemeral),
      },
    });
  }

  if (
    payload.type === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND &&
    payload.data?.name === DISCORD_INFO_COMMAND_NAME
  ) {
    return jsonResponse({
      type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: createInfoContent(request, url),
        flags: getEphemeralFlag(ephemeral),
      },
    });
  }

  if (
    payload.type === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND &&
    payload.data?.name === DISCORD_HELP_COMMAND_NAME
  ) {
    return jsonResponse({
      type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
      data: createHelpResponseData(ephemeral),
    });
  }

  if (
    payload.type === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND &&
    payload.data?.name === DISCORD_BUTTONS_COMMAND_NAME
  ) {
    return jsonResponse({
      type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
      data: createButtonTestResponseData(ephemeral),
    });
  }

  if (
    payload.type === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND &&
    payload.data?.name === DISCORD_NAME_COMMAND_NAME
  ) {
    return jsonResponse({
      type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
      data: await createNameCommandResponse(payload, name, ephemeral),
    });
  }

  if (
    payload.type === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND &&
    payload.data?.name === DISCORD_PROFILE_COMMAND_NAME
  ) {
    return jsonResponse({
      type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
      data: await createProfileCommandResponse(payload, ephemeral),
    });
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
      data: {
        content: "That button is not handled by this bot.",
        flags: DISCORD_MESSAGE_FLAGS.EPHEMERAL,
      },
    });
  }

  return jsonResponse({
    type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: "Unknown command. Try `/help`.",
      flags: DISCORD_MESSAGE_FLAGS.EPHEMERAL,
    },
  });
}
