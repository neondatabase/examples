"use client";

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
          // Signing in lands on "/": load it fresh, so the server renders the new session and this
          // sheet's styles don't carry over to the todos page.
          if (to === "/") return window.location.assign(to);
          if (replace) router.replace(to);
          else router.push(to);
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
