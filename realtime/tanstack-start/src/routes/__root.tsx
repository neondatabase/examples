import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { RouterContext } from "../router";
import stylesheet from "../style.css?url";

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Neon Realtime Todos — TanStack Start" },
    ],
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  shellComponent: RootDocument,
  notFoundComponent: () => (
    <main>
      <h1>Page not found</h1>
      <a href="/">Return to todos</a>
    </main>
  ),
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
