import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import { getSessionUser } from "../auth.functions";
import type { RouterContext } from "../router";
import stylesheet from "../style.css?url";

export const Route = createRootRouteWithContext<RouterContext>()({
  // Runs on every navigation, so the signed-in user is always current. During
  // SSR it runs in-process with the request's cookies.
  beforeLoad: async () => ({ user: await getSessionUser() }),
  // Pages carry the user's rows, so no shared cache may store them.
  headers: () => ({ "Cache-Control": "private, no-store", Vary: "Cookie" }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Neon Realtime Todos - TanStack DB" },
    ],
    links: [
      { rel: "stylesheet", href: stylesheet },
      // No favicon, so the browser doesn't request `/favicon.ico`.
      { rel: "icon", href: "data:," },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// The router's default error and not-found views (see `router.tsx`).
export function ErrorView({ error }: ErrorComponentProps) {
  return (
    <Message title="Something went wrong">
      {error instanceof Error ? error.message : String(error)}
    </Message>
  );
}

export function NotFoundView() {
  return <Message title="Page not found" />;
}

function Message({
  children,
  title,
}: {
  readonly children?: ReactNode;
  readonly title: string;
}) {
  return (
    <main className="min-h-screen bg-emerald-50 px-4 py-18 text-emerald-950 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="mt-1 mb-3 text-4xl font-bold tracking-[-0.04em]">
          {title}
        </h1>
        {children ? (
          <p className="mb-7 leading-relaxed text-zinc-600 dark:text-zinc-400">
            {children}
          </p>
        ) : null}
        <Link
          className="font-bold text-emerald-700 hover:underline dark:text-emerald-400"
          to="/"
        >
          Back to your todos
        </Link>
      </div>
    </main>
  );
}
