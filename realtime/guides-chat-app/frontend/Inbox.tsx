// From guides/mutations.md "With TanStack DB collections"
import type { FormEvent } from "react";
import { eq, useLiveQuery as useCollectionQuery } from "@tanstack/react-db";

import type { Message } from "../backend/schema";
import type { MessagesCollection } from "./collections";
import { newMessage } from "./mutations";

interface Props {
  messagesCollection: MessagesCollection;
  channelId: number;
  userId: string;
}

export function Inbox({ messagesCollection, channelId, userId }: Props) {
  const { data, isReady, isError } = useCollectionQuery({
    query: (q) =>
      q
        .from({ message: messagesCollection })
        .where(({ message }) => eq(message.channel_id, channelId))
        .orderBy(({ message }) => message.created_at, "desc"),
  });

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();

    if (body) {
      form.reset();
      messagesCollection.insert(newMessage(channelId, userId, body));
    }
  }

  function edit(message: Message) {
    const body = window.prompt("Edit message", message.body)?.trim();

    if (body) {
      messagesCollection.update(message.id, (draft) => {
        draft.body = body;
      });
    }
  }

  if (isError) {
    return <p role="alert">Couldn't sync messages</p>;
  }

  if (!isReady) {
    return <p>Loading messages</p>;
  }

  return (
    <section>
      <form onSubmit={send}>
        <input name="body" placeholder="Message" required />
        <button type="submit">Send</button>
      </form>

      <ul>
        {data.map((message) => (
          <li key={message.id} aria-busy={!message.$synced}>
            {message.body}
            {message.author_id === userId && (
              <>
                <button
                  disabled={!message.$synced}
                  onClick={() => edit(message)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  disabled={!message.$synced}
                  onClick={() => messagesCollection.delete(message.id)}
                  type="button"
                >
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
