import {
  WHATSAPP_GRAPH_API_BASE_URL,
  WHATSAPP_USER_AGENT,
} from "../constants/whatsapp.js";
import { whatsAppApiResponseSchema } from "../schemas/whatsapp.js";
import type {
  MarkWhatsAppMessageAsReadInput,
  SendWhatsAppMessageInput,
  WhatsAppApiRequestInput,
  WhatsAppButton,
} from "../types/whatsapp.js";

const createWhatsAppApiUrl = (phoneNumberId: string, method: string): string =>
  `${WHATSAPP_GRAPH_API_BASE_URL}/${phoneNumberId}/${method}`;

const createInteractiveButtonsPayload = (buttons: WhatsAppButton[]) => ({
  type: "button",
  action: {
    buttons: buttons.map((button) => ({
      type: "reply",
      reply: {
        id: button.id,
        title: button.title,
      },
    })),
  },
});

export const whatsAppApiRequest = async <Result = unknown>({
  accessToken,
  method,
  payload,
  phoneNumberId,
}: WhatsAppApiRequestInput): Promise<Result> => {
  const response = await fetch(createWhatsAppApiUrl(phoneNumberId, method), {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "user-agent": WHATSAPP_USER_AGENT,
    },
    body: JSON.stringify(payload),
  });

  const responseBody: unknown = await response.json();
  const parsedResponse = whatsAppApiResponseSchema.parse(responseBody);

  if (!response.ok) {
    throw new Error(
      `WhatsApp API ${method} failed (${response.status}): ${JSON.stringify(parsedResponse)}`,
    );
  }

  return parsedResponse as Result;
};

export const sendWhatsAppMessage = ({
  accessToken,
  buttons,
  phoneNumberId,
  replyToMessageId,
  text,
  to,
}: SendWhatsAppMessageInput) =>
  whatsAppApiRequest({
    accessToken,
    method: "messages",
    phoneNumberId,
    payload: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      ...(replyToMessageId ? { context: { message_id: replyToMessageId } } : {}),
      ...(buttons
        ? {
            type: "interactive",
            interactive: {
              body: { text },
              ...createInteractiveButtonsPayload(buttons),
            },
          }
        : {
            type: "text",
            text: { body: text },
          }),
    },
  });

export const markWhatsAppMessageAsRead = ({
  accessToken,
  messageId,
  phoneNumberId,
}: MarkWhatsAppMessageAsReadInput) =>
  whatsAppApiRequest({
    accessToken,
    method: "messages",
    phoneNumberId,
    payload: {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    },
  });
