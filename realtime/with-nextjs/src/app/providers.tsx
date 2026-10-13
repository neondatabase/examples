"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/client";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={router.push}
      replace={router.replace}
      // Re-renders Server Components with the new session. Safe for the live list: todo-list.tsx pins the
      // sealed query from the first render, so a refresh doesn't restart its stream.
      onSessionChange={() => router.refresh()}
      Link={Link}
      redirectTo="/"
    >
      {children}
    </NeonAuthUIProvider>
  );
}
