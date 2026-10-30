import authCss from "../../auth/auth-ui.css?url";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { AuthPage } from "../../auth/auth-page";

// The auth UI's global styles load as this route's stylesheet link, and its
// providers stay off the app's pages because leaving this route is always a
// full page load.
export const Route = createFileRoute("/auth/$path")({
  // The auth UI reads the session in the browser only.
  ssr: false,
  head: () => ({ links: [{ rel: "stylesheet", href: authCss }] }),
  beforeLoad: ({ context, params }) => {
    // Other auth paths, like a password reset, stay reachable when signed in.
    if (
      context.user &&
      (params.path === "sign-in" || params.path === "sign-up")
    ) {
      throw redirect({ href: "/", reloadDocument: true });
    }
  },
  component: AuthPage,
});
