import { getSafeRedirectTo } from "@better-auth-ui/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, getRouteApi, useRouter } from "@tanstack/react-router";
import { type ComponentProps, useState } from "react";

import { AuthProvider } from "@/components/auth/auth-provider";
import { Auth } from "@/components/auth/auth";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { authClient } from "./client";

// Not the route's `Route`, which imports this file.
const route = getRouteApi("/auth/$path");

// Better Auth UI's sign-in, sign-up and password pages. Only this file and its
// route import the auth UI.
export function AuthPage() {
  const { path } = route.useParams();
  const router = useRouter();
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
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
          // Signing in lands on "/": load it fresh, so the server renders the
          // new session and this route's stylesheet doesn't carry over.
          if (target === "/") return window.location.assign(target);
          void router.navigate({ href: target, replace });
        }}
        Link={RouterLink}
        redirectTo="/"
      >
        <TooltipProvider>
          <main className="flex min-h-screen items-center justify-center p-4">
            <Auth path={path} />
          </main>
        </TooltipProvider>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

// The auth UI's links append the current query string, which `to` doesn't
// parse.
function RouterLink({
  href,
  to: _to,
  ...props
}: { readonly href: string; readonly to?: string } & Omit<
  ComponentProps<"a">,
  "href"
>) {
  const url = new URL(href, window.location.origin);
  return (
    <Link
      to={url.pathname}
      search={Object.fromEntries(url.searchParams)}
      hash={url.hash.slice(1)}
      {...props}
    />
  );
}
