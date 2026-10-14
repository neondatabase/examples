"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { authClient } from "./client";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => {
        window.location.assign("/");
        // Never settles, so the auth UI doesn't also navigate client-side.
        return new Promise<never>(() => {});
      }}
      Link={Link}
      redirectTo="/"
    >
      {children}
    </NeonAuthUIProvider>
  );
}
