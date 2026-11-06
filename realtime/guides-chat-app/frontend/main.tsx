// From guides/mutations.md "Render the app". Not from the guides: the sign-in views, joining channels
// and the ChatApp shell, which the guides leave out
import "./style.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RealtimeProvider } from "@neon/realtime-react";
import { getSafeRedirectTo } from "@better-auth-ui/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps, ReactNode } from "react";

import { fetchSealedInbox, joinChannels } from "./api";
import { authClient } from "./auth";
import { client } from "./client";
import { createMessagesCollection } from "./collections";
import { ChatApp } from "./ChatApp";
import { Auth } from "./components/auth/auth";
import { AuthProvider } from "./components/auth/auth-provider";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";

const root = createRoot(document.getElementById("root")!);
const queryClient = new QueryClient();

// Better Auth UI's provider. Every navigation is a full page load, so signing out also drops the collection's rows
function AuthUI({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider
        authClient={authClient}
        emailAndPassword={{ requireEmailVerification: false }}
        navigate={({ to, replace }) => {
          // Better Auth UI passes ?redirectTo= from the URL through here after sign-in. getSafeRedirectTo
          // can still return "//host" (for "/a/..//host"), which a browser treats as another site.
          const path = getSafeRedirectTo(to, location.origin);
          const target = path.startsWith("//") ? "/" : path;
          if (replace) location.replace(target);
          else location.assign(target);
        }}
        Link={PageLink}
        redirectTo="/"
      >
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function PageLink({
  to: _to,
  ...props
}: { href: string; to?: string } & ComponentProps<"a">) {
  return <a {...props} />;
}

// The sign-in, sign-up and sign-out views, on /auth/*. There's no settings view
if (location.pathname.startsWith("/auth/")) {
  root.render(
    <StrictMode>
      <AuthUI>
        <main className="flex min-h-screen items-center justify-center bg-emerald-50 p-4 dark:bg-zinc-950">
          <Auth path={location.pathname.slice("/auth/".length)} />
        </main>
      </AuthUI>
    </StrictMode>,
  );
} else {
  const { data: session } = await authClient.getSession();

  if (!session) {
    location.replace("/auth/sign-in");
  } else {
    // Join channels 1-3 before sealing queries that join through channel_members
    const channels = await joinChannels();
    const messagesCollection = createMessagesCollection(
      await fetchSealedInbox(),
    );

    // AuthUI serves ChatApp's UserButton, and ChatApp renders both of the guides' views
    root.render(
      <StrictMode>
        <AuthUI>
          <RealtimeProvider client={client}>
            <ChatApp
              channels={channels}
              messagesCollection={messagesCollection}
              userId={session.user.id}
            />
          </RealtimeProvider>
        </AuthUI>
      </StrictMode>,
    );
  }
}
