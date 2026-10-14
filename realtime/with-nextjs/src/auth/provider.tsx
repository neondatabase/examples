"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";

import { authClient } from "./client";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // After a sign-in or sign-out, the auth UI's next navigation is a full page load. It drops the Realtime
  // client, its socket and the previous user's rows.
  const sessionChanged = useRef(false);
  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={(href) =>
        sessionChanged.current
          ? window.location.assign(href)
          : router.push(href)
      }
      replace={router.replace}
      onSessionChange={() => {
        sessionChanged.current = true;
      }}
      Link={Link}
      redirectTo="/"
    >
      {children}
    </NeonAuthUIProvider>
  );
}
