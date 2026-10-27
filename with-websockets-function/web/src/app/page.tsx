"use client";

import { useSession } from "@better-auth-ui/react";
import { UserButton } from "@/components/auth/user/user-button";
import { Chat } from "@/components/chat";
import { authClient } from "@/lib/auth/client";

export default function Home() {
  // proxy.ts redirects signed-out requests, so a missing session here is still loading.
  const { data: session } = useSession(authClient);
  if (!session) return null;

  const userName = session.user.name || session.user.email;
  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold">Neon WebSocket Chat</h1>
          <p className="text-muted-foreground text-xs">
            Signed in as {userName}
          </p>
        </div>
        <UserButton size="icon" hideSettings />
      </header>
      <Chat userName={userName} />
    </main>
  );
}
