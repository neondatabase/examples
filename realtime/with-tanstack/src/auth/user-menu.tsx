import { authClient } from "./client";

// The signed-in user's email and a Sign out button.
export function UserMenu({ email }: { readonly email: string }) {
  // A full page load drops the DbClient, the Realtime socket and cached rows.
  async function signOut() {
    await authClient.signOut();
    window.location.assign("/auth/sign-in");
  }

  return (
    <nav className="absolute inset-x-0 top-0 mx-auto flex w-full max-w-2xl items-center justify-end gap-3 px-4 pt-4 text-[13px] text-zinc-600 dark:text-zinc-400">
      <span className="truncate">{email}</span>
      <button
        className="cursor-pointer bg-transparent p-2 font-medium hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:hover:text-emerald-400"
        onClick={signOut}
        type="button"
      >
        Sign out
      </button>
    </nav>
  );
}
