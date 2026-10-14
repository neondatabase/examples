import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { UserMenu } from "../auth/user-menu";

// Signed-in pages. UX only: every server function checks `requireUser` too.
export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context }) => {
    if (!context.user) {
      throw redirect({
        to: "/auth/$path",
        params: { path: "sign-in" },
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
