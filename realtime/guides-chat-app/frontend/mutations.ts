// From guides/mutations.md "Shared mutation helpers"
import type { Message } from "../backend/schema";
import type { MutationResponse } from "../backend/server";
import { deleteMessage, editMessage, sendMessage } from "./api";

export type MessageMutation =
  | { readonly type: "send"; readonly message: Message }
  | { readonly type: "edit"; readonly id: string; readonly body: string }
  | { readonly type: "delete"; readonly id: string };

export type OptimisticMessage = Message & {
  readonly pending?: boolean;
};

// The server sets its own author and timestamp, but keeps the client's id
export function newMessage(
  channelId: number,
  authorId: string,
  body: string,
): Message {
  return {
    id: crypto.randomUUID(),
    channel_id: channelId,
    author_id: authorId,
    body,
    created_at: new Date(),
  };
}

export function applyMutation(
  messages: readonly OptimisticMessage[],
  mutation: MessageMutation,
): readonly OptimisticMessage[] {
  switch (mutation.type) {
    case "send":
      // Once the sent message has synced, show the synced row only
      if (messages.some((message) => message.id === mutation.message.id)) {
        return messages;
      }

      // Newest first, to match the query's order
      return [{ ...mutation.message, pending: true }, ...messages];
    case "edit":
      return messages.map((message) =>
        message.id === mutation.id
          ? { ...message, body: mutation.body, pending: true }
          : message,
      );
    case "delete":
      return messages.filter((message) => message.id !== mutation.id);
  }
}

export function writeMutation(
  mutation: MessageMutation,
): Promise<MutationResponse> {
  switch (mutation.type) {
    case "send":
      return sendMessage(mutation.message);
    case "edit":
      return editMessage(mutation.id, mutation.body);
    case "delete":
      return deleteMessage(mutation.id);
  }
}
