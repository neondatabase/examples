"use client";

import { getSafeRedirectTo } from "@better-auth-ui/core";
import { QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AuthProvider } from "@/components/auth/auth-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getQueryClient } from "@/lib/query-client";

import { authClient } from "./client";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <QueryClientProvider client={getQueryClient()}>
      <AuthProvider
        authClient={authClient}
        emailAndPassword={{ requireEmailVerification: false }}
        navigate={({ to, replace }) => {
          // Better Auth UI passes ?redirectTo= from the URL through here after sign-in. getSafeRedirectTo
          // can still return "//host" (for "/a/..//host"), which a browser treats as another site.
          const path = getSafeRedirectTo(to, window.location.origin);
          const target = path.startsWith("//") ? "/" : path;
          // Signing in lands on "/": load it fresh, so the server renders the new session and this
          // sheet's styles don't carry over to the todos page.
          if (target === "/") return window.location.assign(target);
          if (replace) router.replace(target);
          else router.push(target);
        }}
        Link={Link}
        redirectTo="/"
      >
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
