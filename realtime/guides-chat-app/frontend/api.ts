// From guides/subscribing.md "Fetch from an API endpoint", reactivity.md "Create the collection"
// and mutations.md "Calling the routes from the frontend"
import type { SealedLiveQuery } from "@neon/realtime/client";
import { hc } from "hono/client";

import type { Message } from "../backend/schema";
import type { AppType, MutationResponse } from "../backend/server";
import { authClient } from "./auth";

export const server = hc<AppType>(window.location.origin, {
  headers: async (): Promise<Record<string, string>> => {
    const { data } = await authClient.getSession();
    const token = data?.session.token;

    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});

export async function fetchSealedMessages(
  channelId: number,
): Promise<SealedLiveQuery<Message>> {
  const res = await server.api.v1.messages.live.$post({ json: { channelId } });

  if (!res.ok) {
    throw new Error(`Could not fetch the sealed query (${res.status})`);
  }

  return (await res.json()) as SealedLiveQuery<Message>;
}

export async function fetchSealedInbox(): Promise<SealedLiveQuery<Message>> {
  const res = await server.api.v1.inbox.live.$post();

  if (!res.ok) {
    throw new Error(`Could not fetch the inbox query (${res.status})`);
  }

  return (await res.json()) as SealedLiveQuery<Message>;
}

export async function sendMessage({
  id,
  channel_id,
  body,
}: Pick<Message, "id" | "channel_id" | "body">): Promise<MutationResponse> {
  const res = await server.api.v1.messages.$post({
    json: { id, channelId: channel_id, body },
  });

  if (!res.ok) {
    throw new Error(`Could not send the message (${res.status})`);
  }

  return res.json();
}

export async function editMessage(
  id: string,
  body: string,
): Promise<MutationResponse> {
  const res = await server.api.v1.messages[":id"].$patch({
    param: { id },
    json: { body },
  });

  if (!res.ok) {
    throw new Error(`Could not edit the message (${res.status})`);
  }

  return res.json();
}

export async function deleteMessage(id: string): Promise<MutationResponse> {
  const res = await server.api.v1.messages[":id"].$delete({ param: { id } });

  if (!res.ok) {
    throw new Error(`Could not delete the message (${res.status})`);
  }

  return res.json();
}

// Not from the guides: adds the signed-in user to channels 1-3 and returns them
export async function joinChannels() {
  const res = await server.api.v1.channels.join.$post();

  if (!res.ok) {
    throw new Error(`Could not join the channels (${res.status})`);
  }

  return (await res.json()).channels;
}
