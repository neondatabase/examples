import "./style.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RealtimeProvider } from "@neon/realtime-react";
import { AuthView, NeonAuthUIProvider } from "@neondatabase/auth-ui";

import { fetchSealedInbox, joinChannels } from "./api";
import { authClient } from "./auth";
import { client } from "./client";
import { createMessagesCollection } from "./collections";
import { ChatApp } from "./components/ChatApp";

const root = createRoot(document.getElementById("root")!);

// Neon Auth's sign-in, sign-up and sign-out views, on /auth/*. There's no account view.
// They navigate with full page loads, so signing out also drops the collection's rows
if (location.pathname.startsWith("/auth/")) {
  root.render(
    <StrictMode>
      <NeonAuthUIProvider authClient={authClient} account={false}>
        <main className="flex min-h-screen items-center justify-center bg-emerald-50 p-4 dark:bg-zinc-950">
          <AuthView pathname={location.pathname} />
        </main>
      </NeonAuthUIProvider>
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

    // NeonAuthUIProvider serves ChatApp's UserButton, and ChatApp renders both of the guides' views
    root.render(
      <StrictMode>
        <NeonAuthUIProvider authClient={authClient} account={false}>
          <RealtimeProvider client={client}>
            <ChatApp
              channels={channels}
              messagesCollection={messagesCollection}
              userId={session.user.id}
            />
          </RealtimeProvider>
        </NeonAuthUIProvider>
      </StrictMode>,
    );
  }
}
