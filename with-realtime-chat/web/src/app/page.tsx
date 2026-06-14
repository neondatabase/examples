"use client";

import { SignedIn, SignedOut, RedirectToSignIn, UserButton } from "@neondatabase/auth-ui";
import { authClient } from "@/lib/auth/client";
import { Chat } from "@/components/chat";

export default function Home() {
  const { data: session } = authClient.useSession();

  return (
    <>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
      <SignedIn>
        <main className="mx-auto flex h-screen max-w-2xl flex-col">
          <header className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h1 className="text-sm font-semibold">Neon Realtime Chat</h1>
              <p className="text-muted-foreground text-xs">
                Signed in as {session?.user.name || session?.user.email}
              </p>
            </div>
            <UserButton size="icon" />
          </header>
          <Chat userName={session?.user.name || session?.user.email || "anon"} />
        </main>
      </SignedIn>
    </>
  );
}
