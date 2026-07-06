import * as z from "zod";
import type { WHATSAPP_BUTTON_TEST_ACTIONS } from "../constants/whatsapp.js";
import type {
  whatsAppMessageSchema,
  whatsAppWebhookPayloadSchema,
} from "../schemas/whatsapp.js";

export type WhatsAppMessage = z.infer<typeof whatsAppMessageSchema>;

export type WhatsAppWebhookPayload = z.infer<typeof whatsAppWebhookPayloadSchema>;

export type WhatsAppParsedCommand = {
  args: string | undefined;
  name: string;
};

export type WhatsAppButtonTestAction =
  (typeof WHATSAPP_BUTTON_TEST_ACTIONS)[keyof typeof WHATSAPP_BUTTON_TEST_ACTIONS];

export type WhatsAppButton = {
  id: string;
  title: string;
};

export type WhatsAppOutboundMessage = {
  replyToMessageId?: string;
  text: string;
  to: string;
  buttons?: WhatsAppButton[];
};

export type WhatsAppApiRequestInput = {
  accessToken: string;
  method: string;
  payload: Record<string, unknown>;
  phoneNumberId: string;
};

export type SendWhatsAppMessageInput = {
  accessToken: string;
  phoneNumberId: string;
} & WhatsAppOutboundMessage;

export type MarkWhatsAppMessageAsReadInput = {
  accessToken: string;
  messageId: string;
  phoneNumberId: string;
};

export type VerifyWhatsAppRequestInput = {
  appSecret: string | undefined;
  body: string;
  signature: string | null;
};

export type VerifyWhatsAppWebhookChallengeInput = {
  mode: string | null;
  token: string | null;
  verifyToken: string | undefined;
};

export type WhatsAppMessageContext = {
  accessToken: string;
  message: WhatsAppMessage;
  phoneNumberId: string;
};

export type WhatsAppMessageHandlerContext = WhatsAppMessageContext & {
  request: Request;
  url: URL;
};

export type CommandUsageSummary = {
  commandName: string;
  runCount: number;
};

export type WhatsAppInfoResponseInput = {
  branch: string;
  functionUrl: string;
  method: string;
  platform: string;
  runtime: string;
};

export type WhatsAppProfileResponseInput = {
  name: string | undefined;
  totalRuns: number;
  usageLines: string[];
};

export type WhatsAppCommandContext = {
  accessToken: string;
  args: string | undefined;
  command: string;
  message: WhatsAppMessage;
  phoneNumberId: string;
  request: Request;
  url: URL;
};

export type WhatsAppCommandHandler = (
  context: WhatsAppCommandContext,
) => WhatsAppOutboundMessage | Promise<WhatsAppOutboundMessage>;
