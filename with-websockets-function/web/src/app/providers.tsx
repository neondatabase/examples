"use client";

import { getSafeRedirectTo } from "@better-auth-ui/core";
import { QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/components/auth/auth-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth/client";
import { getQueryClient } from "@/lib/query-client";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    // Sets the `.dark` class that globals.css keys the dark theme on.
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={getQueryClient()}>
        <AuthProvider
          authClient={authClient}
          emailAndPassword={{ requireEmailVerification: false }}
          navigate={({ to, replace }) => {
            // Better Auth UI passes ?redirectTo= from the URL through here after sign-in. getSafeRedirectTo
            // can still return "//host" (for "/a/..//host"), so the result is checked against the origin.
            const path = getSafeRedirectTo(to, window.location.origin);
            const target =
              new URL(path, window.location.origin).origin ===
              window.location.origin
                ? path
                : "/";
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
    </ThemeProvider>
  );
}
