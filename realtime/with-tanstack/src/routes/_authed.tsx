import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { UserMenu } from "../auth/user-menu";

// Signed-in pages. The redirect is for the user experience only: every server
// function checks the session again with `requireUser`.
export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    if (!context.user) {
      throw redirect({
        to: "/auth/$path",
        params: { path: "sign-in" },
        search: { redirect: location.href },
        // An SSR redirect skips the root route's `headers`.
        headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
      });
    }
    return { user: context.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = Route.useRouteContext();

  return (
    <div className="relative">
      <UserMenu email={user.email} />
      <Outlet />
    </div>
  );
}
