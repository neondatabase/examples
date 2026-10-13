import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { authClient } from "../auth-client";

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

  // A full page load drops the DbClient, the Realtime socket and cached rows.
  async function signOut() {
    await authClient.signOut();
    window.location.assign("/auth/sign-in");
  }

  return (
    <div className="relative">
      <nav className="absolute inset-x-0 top-0 mx-auto flex w-full max-w-2xl items-center justify-end gap-3 px-4 pt-4 text-[13px] text-zinc-600 dark:text-zinc-400">
        <span className="truncate">{user.email}</span>
        <button
          className="cursor-pointer bg-transparent p-2 font-medium hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:hover:text-emerald-400"
          onClick={signOut}
          type="button"
        >
          Sign out
        </button>
      </nav>
      <Outlet />
    </div>
  );
}
