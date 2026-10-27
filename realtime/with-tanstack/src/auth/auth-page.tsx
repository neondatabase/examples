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
          // Signing in lands on "/": load it fresh, so the server renders the
          // new session and this route's stylesheet doesn't carry over.
          if (to === "/") return window.location.assign(to);
          void router.navigate({ href: to, replace });
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
