"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Chat } from "@/components/chat";
import { Button } from "@/components/ui/button";

export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold">Neon Realtime Chat</h1>
          <p className="text-muted-foreground text-xs">
            Signed in as {session.user.name || session.user.email}
          </p>
        </div>
        <Button
          variant="outline"
          size="default"
          onClick={async () => {
            await authClient.signOut();
            router.replace("/login");
          }}
        >
          Sign out
        </Button>
      </header>
      <Chat userName={session.user.name || session.user.email || "anon"} />
    </main>
  );
}
