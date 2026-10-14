import { AuthView, NeonAuthUIProvider } from "@neondatabase/auth-ui";
import { Link, getRouteApi, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { authClient } from "./client";

// Not the route's `Route`, which imports this file.
const route = getRouteApi("/auth/$path");

// Neon's prebuilt sign-in, sign-up and password pages. Only this file and its
// route import the auth UI.
export function AuthPage() {
  const { path } = route.useParams();
  const router = useRouter();

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={(href) => router.navigate({ href })}
      replace={(href) => router.navigate({ href, replace: true })}
      Link={RouterLink}
      redirectTo="/"
      onSessionChange={() => {
        window.location.assign("/");
        // Never settles, so the auth UI doesn't also navigate client-side.
        return new Promise<never>(() => {});
      }}
    >
      <main className="flex min-h-screen items-center justify-center p-4">
        {/* Without `redirectTo` here, the auth UI reads an unchecked
            `?redirectTo=` from the URL. */}
        <AuthView path={path} redirectTo="/" />
      </main>
    </NeonAuthUIProvider>
  );
}

// The auth UI's links append the current query string, which `to` doesn't
// parse.
function RouterLink({
  href,
  ...props
}: {
  readonly href: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
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
