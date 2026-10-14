import authCss from "@neondatabase/auth-ui/css?url";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { AuthPage } from "../../auth/auth-page";

// The auth UI's global styles load as this route's stylesheet link, and its
// providers stay off the app's pages because leaving this route is always a
// full page load.
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
