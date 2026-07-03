import {
  DISCORD_EPHEMERAL_OPTION_NAME,
  DISCORD_INTERACTIONS_PATH,
  DISCORD_INTERACTION_TYPES,
  DISCORD_RESPONSE_TYPES,
} from "../src/constants/discord.js";
import { discordInteractionSchema } from "../src/schemas/discord.js";
import { commandHandlers, trackApplicationCommandRun } from "../src/utils/discordCommands.js";
import { getBooleanCommandOption } from "../src/utils/discordOptions.js";
import { createErrorResponseData } from "../src/utils/discordResponses.js";
import { createButtonTestClickResponseData, parseButtonTestCustomId } from "../src/utils/generalComponents.js";
import { jsonResponse } from "../src/utils/jsonResponse.js";
import { verifyDiscordRequest } from "../src/utils/verifyDiscordRequest.js";

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
