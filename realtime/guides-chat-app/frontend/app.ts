// From guides/subscribing.md "Renew the sealed query" (supersedes "Subscribe to the sealed query"). Not loaded by the app
import type { LiveQuerySnapshot, LiveQueryState } from "@neon/realtime/client";

import type { Message } from "../backend/schema";
import { fetchSealedMessages } from "./api";
import { client } from "./client";
import { renewBeforeExpiry } from "./renewal";

const list = document.querySelector<HTMLUListElement>("#messages")!;
const statusLine = document.querySelector<HTMLParagraphElement>("#status")!;

// A real app takes the channel from its router
const channelId = 2;

const sealedQuery = await fetchSealedMessages(channelId);
const subscription = client.subscribe(sealedQuery);
const stopRenewing = renewBeforeExpiry(subscription, sealedQuery, () =>
  fetchSealedMessages(channelId),
);

subscription.onChange(render);

window.addEventListener("beforeunload", () => {
  stopRenewing();
  subscription.unsubscribe();
  client.close();
});

function render(snapshot: LiveQuerySnapshot<Message>) {
  statusLine.textContent = describe(snapshot);
  list.replaceChildren(...(snapshot.data ?? []).map(renderMessage));
}

function describe(state: LiveQueryState): string {
  switch (state.status) {
    case "connecting":
      return "Loading messages";
    case "live":
      return "Up to date";
    case "stale":
      return "Updating. Messages may be out of date.";
    case "error":
      return `Stopped: ${state.error.message}`;
    case "closed":
      return "Closed";
  }
}

function renderMessage(message: Message): HTMLLIElement {
  const item = document.createElement("li");

  item.textContent = `${message.created_at.toLocaleTimeString()} ${message.body}`;

  return item;
}
