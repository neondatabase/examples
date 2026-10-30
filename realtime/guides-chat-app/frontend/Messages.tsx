// From guides/mutations.md "With React's useOptimistic hook"
import {
  type FormEvent,
  startTransition,
  useEffect,
  useOptimistic,
  useState,
} from "react";
import { useLiveQuery } from "@neon/realtime-react";
import type { SealedLiveQuery } from "@neon/realtime/client";

import type { Message } from "../backend/schema";
import { LocalTime } from "./LocalTime";
import {
  applyMutation,
  type MessageMutation,
  newMessage,
  type OptimisticMessage,
  writeMutation,
} from "./mutations";

const NO_MESSAGES: readonly OptimisticMessage[] = [];

interface Props {
  sealedQuery: SealedLiveQuery<Message>;
  refreshQuery: () => Promise<SealedLiveQuery<Message>>;
  initialData?: readonly Message[];
  channelId: number;
  userId: string;
}

export function Messages({
  sealedQuery,
  refreshQuery,
  initialData,
  channelId,
  userId,
}: Props) {
  const { data, status, error, utils } = useLiveQuery(sealedQuery, {
    refreshQuery,
    initialData,
  });

  const [messages, addOptimistic] = useOptimistic<
    readonly OptimisticMessage[],
    MessageMutation
  >(data ?? NO_MESSAGES, applyMutation);

  const [mutationError, setMutationError] = useState<string>();

  useEffect(() => {
    return utils.onUpdate((update) => {
      if (update.type === "changes") {
        console.debug(
          `Applied ${update.changes.length} changes from transactions ${update.batch.txids.join(", ")}`,
        );
      }
    });
  }, [utils]);

  function mutate(mutation: MessageMutation) {
    setMutationError(undefined);

    startTransition(async () => {
      addOptimistic(mutation);

      try {
        const result = await writeMutation(mutation);

        if (result.kind === "committed") {
          await utils.awaitTxId(result.txid, 10_000);
        }
      } catch {
        setMutationError("Couldn't confirm the change");
      }
    });
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();

    if (body) {
      form.reset();
      mutate({ type: "send", message: newMessage(channelId, userId, body) });
    }
  }

  function edit(message: OptimisticMessage) {
    const body = window.prompt("Edit message", message.body)?.trim();

    if (body) {
      mutate({ type: "edit", id: message.id, body });
    }
  }

  if (status === "error") {
    return <p role="alert">Live updates stopped: {error.message}</p>;
  }

  if (data === undefined) {
    return <p>Loading messages</p>;
  }

  return (
    <section>
      <form onSubmit={send}>
        <input name="body" placeholder="Message" required />
        <button type="submit">Send</button>
      </form>

      {status === "stale" && <p role="status">Updating</p>}
      {mutationError && <p role="alert">{mutationError}</p>}

      <ul>
        {messages.map((message) => (
          <li key={message.id} aria-busy={message.pending}>
            <LocalTime date={message.created_at} />
            <p>{message.body}</p>
            {message.author_id === userId && (
              <>
                <button
                  disabled={message.pending}
                  onClick={() => edit(message)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  disabled={message.pending}
                  onClick={() => mutate({ type: "delete", id: message.id })}
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
