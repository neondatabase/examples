import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AppShell } from "~/components/AppShell";
import { Button, ZapIcon } from "~/components/ui";
import { loadWorkspaceData } from "~/functions/load-workspace";
import { RealtimeProvider } from "~/realtime/RealtimeProvider";
import type { RouterContext } from "~/router";
import stylesheet from "../styles.css?url";

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Livebase · Neon Realtime" },
      {
        name: "description",
        content:
          "Paste anything about a lead and watch AI agents enrich it in real time, synced from Postgres by Neon Realtime.",
      },
      { name: "color-scheme", content: "dark" },
      { name: "theme-color", content: "#0c0d0d" },
    ],
    links: [
      { rel: "stylesheet", href: stylesheet },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  // The workspace data loads once during SSR and then stays live through Neon
  // Realtime, so navigation never needs to reload it. Collections refresh their
  // own capabilities.
  loader: () => loadWorkspaceData(),
  shouldReload: false,
  shellComponent: RootDocument,
  component: RootComponent,
  errorComponent: RootError,
  notFoundComponent: RootNotFound,
});

function RootDocument({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const data = Route.useLoaderData();
  const { dbClient, realtimeClient, connection } = Route.useRouteContext();
  return (
    <RealtimeProvider
      data={data}
      dbClient={dbClient}
      realtimeClient={realtimeClient}
      connection={connection}
    >
      <AppShell>
        <Outlet />
      </AppShell>
    </RealtimeProvider>
  );
}

// A root loader failure renders this outside RealtimeProvider, so it can't use
// the app shell. `invalidate()` re-runs the loader and resets the boundary.
function RootError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <RouteMessage
      title="Something went wrong"
      detail={<ErrorDetail summary="Livebase couldn't load this page." error={error} />}
    >
      <Button variant="secondary" size="sm" onClick={() => void router.invalidate()}>
        Try again
      </Button>
      <HomeLink />
    </RouteMessage>
  );
}

// The router's `defaultErrorComponent`, for errors inside a page. It renders
// in the app shell, so the top bar and the live data stay up. `reset` renders
// the page again without re-running the root loader.
export function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <RouteMessage
      title="Something went wrong"
      detail={<ErrorDetail summary="This page hit an error." error={error} />}
    >
      <Button variant="secondary" size="sm" onClick={reset}>
        Try again
      </Button>
      <HomeLink />
    </RouteMessage>
  );
}

function ErrorDetail({ summary, error }: { readonly summary: string; readonly error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <>
      <p>{summary}</p>
      {message ? (
        <p className="mt-3 rounded-md border border-line bg-surface px-3 py-2 text-left font-mono text-xs break-words text-fg-subtle">
          {message}
        </p>
      ) : null}
    </>
  );
}

// Only unmatched URLs land here. An unknown lead ID matches the lead route,
// which renders its own message.
function RootNotFound() {
  return (
    <RouteMessage title="Page not found" detail="There's nothing at this address.">
      <HomeLink />
    </RouteMessage>
  );
}

// Self-contained, with its own mark, because it may render with or without
// the top bar depending on where the router places it.
function RouteMessage({
  title,
  detail,
  children,
}: {
  readonly title: string;
  readonly detail?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <span className="mb-5 flex size-10 items-center justify-center rounded-lg border border-line bg-surface">
          <ZapIcon size={20} className="text-accent" />
        </span>
        <h1 className="text-lg font-semibold tracking-tight text-fg">{title}</h1>
        {detail ? <div className="mt-2 w-full text-sm text-fg-muted">{detail}</div> : null}
        {children ? <div className="mt-6 flex items-center gap-4">{children}</div> : null}
      </div>
    </div>
  );
}

function HomeLink() {
  return (
    <Link
      to="/"
      className="rounded-sm text-[13px] font-medium text-accent transition-colors hover:text-accent-strong"
    >
      Back to leads
    </Link>
  );
}
