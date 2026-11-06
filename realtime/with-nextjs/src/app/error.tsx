"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  return (
    <main className="min-h-screen bg-emerald-50 px-4 py-18 text-emerald-950 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto w-full max-w-2xl">
        <p
          role="alert"
          className="mb-4 rounded-xl bg-red-50 p-3 text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          Couldn&apos;t load your todos.
        </p>
        <button
          className="cursor-pointer rounded-xl bg-emerald-500 px-4 py-3 font-bold text-emerald-950 hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          // reset() alone re-renders the client tree with the same failed server payload. Refresh first, so the
          // retry runs the Server Components again, in one transition with the reset.
          onClick={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
          type="button"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
