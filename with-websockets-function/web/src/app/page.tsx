"use client";

import { useSession } from "@better-auth-ui/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { UserButton } from "@/components/auth/user/user-button";
import { Chat } from "@/components/chat";
import { authClient } from "@/lib/auth/client";

export default function Home() {
  const router = useRouter();
  const { data: session, isFetching } = useSession(authClient);

  // proxy.ts redirects signed-out page loads. This covers a session that ends while the page is open.
  // Waiting for the refetch matters right after sign-in, when the cached result is still signed out.
  const signedOut = !session && !isFetching;
  useEffect(() => {
    if (signedOut) router.replace("/auth/sign-in");
  }, [signedOut, router]);

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
