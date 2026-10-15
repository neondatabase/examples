// The app shell. Pick a channel and see it through both of the guides' React views
import { UserButton } from "@neondatabase/auth-ui";
import { useState } from "react";

import type { joinChannels } from "./api";
import type { MessagesCollection } from "./collections";
import { Channel } from "./Channel";
import { Inbox } from "./Inbox";

interface Props {
  channels: Awaited<ReturnType<typeof joinChannels>>;
  messagesCollection: MessagesCollection;
  userId: string;
}

export function ChatApp({ channels, messagesCollection, userId }: Props) {
  // The guides' running example uses channel 2
  const [channelId, setChannelId] = useState(2);

  return (
    <main className="min-h-screen bg-emerald-50 px-4 py-18 text-emerald-950 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex items-end justify-between gap-6">
          <div>
            <p className="m-0 text-xs font-extrabold tracking-[0.08em] text-emerald-700 uppercase dark:text-emerald-400">
              Neon Realtime
            </p>
            <h1 className="mt-1 mb-3 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
              Guides chat
            </h1>
          </div>
          <UserButton size="icon" />
        </header>

        <p className="mb-7 max-w-xl leading-relaxed text-zinc-600 dark:text-zinc-400">
          Sign in as a second user in a private window. Both views show the
          selected channel. Changes appear in them immediately and arrive in the
          other window live.
        </p>

        <nav aria-label="Channels" className="mb-7 flex gap-2">
          {channels.map((channel) => (
            <button
              aria-pressed={channel.id === channelId}
              className="cursor-pointer rounded-full border border-emerald-950/20 px-3 py-1 text-sm font-medium hover:border-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 aria-pressed:border-emerald-500 aria-pressed:bg-emerald-500 aria-pressed:text-emerald-950 dark:border-zinc-700"
              key={channel.id}
              onClick={() => setChannelId(channel.id)}
              type="button"
            >
              #{channel.name}
            </button>
          ))}
        </nav>

        <div className="grid gap-6 md:grid-cols-2">
          <section aria-labelledby="live-query-view" className="guide-view">
            <h2 id="live-query-view">useLiveQuery + useOptimistic</h2>
            <p>Seals a live query for this channel.</p>
            <Channel channelId={channelId} userId={userId} />
          </section>
          <section aria-labelledby="inbox-view" className="guide-view">
            <h2 id="inbox-view">TanStack DB inbox</h2>
            <p>Filters the synced inbox to this channel, locally.</p>
            <Inbox
              messagesCollection={messagesCollection}
              channelId={channelId}
              userId={userId}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
