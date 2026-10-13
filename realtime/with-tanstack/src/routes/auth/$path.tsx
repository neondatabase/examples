import { AuthView, NeonAuthUIProvider } from "@neondatabase/auth-ui";
import authCss from "@neondatabase/auth-ui/css?url";
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import { authClient } from "../../auth-client";

// Neon's prebuilt sign-in, sign-up and password pages. This is the only file
// that imports the auth UI. Its global styles load as this route's stylesheet
// link, and its providers stay off the app's pages because leaving this route
// is always a full page load.
export const Route = createFileRoute("/auth/$path")({
  // The auth UI reads the session in the browser only.
  ssr: false,
  head: () => ({ links: [{ rel: "stylesheet", href: authCss }] }),
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: localPath(search.redirect),
  }),
  beforeLoad: ({ context, params, search }) => {
    // Other auth paths, like a password reset, stay reachable when signed in.
    if (
      context.user &&
      (params.path === "sign-in" || params.path === "sign-up")
    ) {
      throw redirect({ href: search.redirect ?? "/", reloadDocument: true });
    }
  },
  component: AuthPage,
});

// Only a path on this site, so the redirect can't send users elsewhere.
// Parsed like the browser would, which also catches `/\evil.example` and a
// tab or newline in `//evil.example`. Anything else is dropped, and the page
// falls back to `/`.
function localPath(value: unknown) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    new URL(value, "http://x.invalid").origin === "http://x.invalid"
    ? value
    : undefined;
}

function AuthPage() {
  const { path } = Route.useParams();
  const { redirect: redirectTo = "/" } = Route.useSearch();
  const router = useRouter();

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={(href) => router.navigate({ href })}
      replace={(href) => router.navigate({ href, replace: true })}
      Link={RouterLink}
      redirectTo={redirectTo}
      onSessionChange={() => {
        window.location.assign(redirectTo);
        // Never settles, so the auth UI doesn't also navigate client-side.
        return new Promise<never>(() => {});
      }}
    >
      <main className="flex min-h-screen items-center justify-center p-4">
        {/* Without `redirectTo` here, the auth UI reads an unchecked
            `?redirectTo=` from the URL. */}
        <AuthView path={path} redirectTo={redirectTo} />
      </main>
    </NeonAuthUIProvider>
  );
}

// The auth UI's links carry the query string (`?redirect=…`), which `to`
// doesn't parse.
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
