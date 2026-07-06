import { WHATSAPP_WEBHOOK_PATH } from "../src/constants/whatsapp.js";
import {
  getWhatsAppAccessToken,
  getWhatsAppAppSecret,
  getWhatsAppPhoneNumberId,
  getWhatsAppVerifyToken,
} from "../src/env.js";
import { whatsAppWebhookPayloadSchema } from "../src/schemas/whatsapp.js";
import type {
  WhatsAppMessage,
  WhatsAppMessageContext,
  WhatsAppMessageHandlerContext,
  WhatsAppWebhookPayload,
} from "../src/types/whatsapp.js";
import { createButtonTestClickMessage, parseButtonTestCallbackData } from "../src/utils/generalComponents.js";
import { jsonResponse } from "../src/utils/jsonResponse.js";
import { markWhatsAppMessageAsRead, sendWhatsAppMessage } from "../src/utils/whatsappApi.js";
import { commandHandlers, trackWhatsAppCommandRun } from "../src/utils/whatsappCommands.js";
import { createErrorMessage } from "../src/utils/whatsappResponses.js";
import { parseWhatsAppCommand } from "../src/utils/whatsappText.js";
import {
  verifyWhatsAppRequest,
  verifyWhatsAppWebhookChallenge,
} from "../src/utils/verifyWhatsAppRequest.js";

const getWhatsAppMessages = (payload: WhatsAppWebhookPayload): WhatsAppMessage[] =>
  payload.entry?.flatMap((entry) => entry.changes?.flatMap((change) => change.value?.messages ?? []) ?? []) ?? [];

const getButtonReplyId = (message: WhatsAppMessage): string | undefined =>
  message.interactive?.type === "button_reply" ? message.interactive.button_reply?.id : undefined;

const markIncomingMessageAsRead = async ({
  accessToken,
  message,
  phoneNumberId,
}: WhatsAppMessageContext): Promise<void> => {
  if (!message.id) {
    return;
  }

  try {
    await markWhatsAppMessageAsRead({ accessToken, messageId: message.id, phoneNumberId });
  } catch (error) {
    console.error("WhatsApp read status update failed.", error);
  }
};

const handleButtonReply = async ({
  accessToken,
  message,
  phoneNumberId,
}: WhatsAppMessageContext): Promise<boolean> => {
  const buttonReplyId = getButtonReplyId(message);
  const action = buttonReplyId ? parseButtonTestCallbackData(buttonReplyId) : undefined;

  if (!buttonReplyId) {
    return false;
  }

  await sendWhatsAppMessage({
    accessToken,
    phoneNumberId,
    replyToMessageId: message.id,
    ...(action
      ? createButtonTestClickMessage(message.from, action)
      : createErrorMessage(message.from, "That button is not handled by this bot.")),
  });

  return true;
};

const handleMessage = async ({
  accessToken,
  message,
  phoneNumberId,
  request,
  url,
}: WhatsAppMessageHandlerContext): Promise<void> => {
  await markIncomingMessageAsRead({ accessToken, message, phoneNumberId });

  if (await handleButtonReply({ accessToken, message, phoneNumberId })) {
    return;
  }

  const command = parseWhatsAppCommand(message.text?.body);

  if (!command) {
    return;
  }

  const commandHandler = commandHandlers[command.name];

  if (commandHandler) {
    void trackWhatsAppCommandRun(message, command.name);

    const responseMessage = await commandHandler({
      accessToken,
      args: command.args,
      command: command.name,
      message,
      phoneNumberId,
      request,
      url,
    });

    await sendWhatsAppMessage({
      accessToken,
      phoneNumberId,
      replyToMessageId: message.id,
      ...responseMessage,
    });

    return;
  }

  await sendWhatsAppMessage({
    accessToken,
    phoneNumberId,
    replyToMessageId: message.id,
    ...createErrorMessage(message.from, "Unknown command. Try /help."),
  });
};

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const isVerified = verifyWhatsAppWebhookChallenge({
      mode: url.searchParams.get("hub.mode"),
      token: url.searchParams.get("hub.verify_token"),
      verifyToken: getWhatsAppVerifyToken(),
    });

    if (!isVerified) {
      return new Response("invalid verify token", { status: 403 });
    }

    return new Response(url.searchParams.get("hub.challenge") ?? "", {
      headers: { "content-type": "text/plain" },
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, { status: 405 });
  }

  const body = await request.text();
  const isVerified = verifyWhatsAppRequest({
    appSecret: getWhatsAppAppSecret(),
    body,
    signature: request.headers.get("x-hub-signature-256"),
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

  const parsedPayload = whatsAppWebhookPayloadSchema.safeParse(payloadBody);

  if (!parsedPayload.success) {
    return jsonResponse({ error: "invalid whatsapp webhook payload" }, { status: 400 });
  }

  const accessToken = getWhatsAppAccessToken();
  const phoneNumberId = getWhatsAppPhoneNumberId();
  const messages = getWhatsAppMessages(parsedPayload.data);

  for (const message of messages) {
    await handleMessage({ accessToken, message, phoneNumberId, request, url });
  }

  return jsonResponse({ ok: true });
}
