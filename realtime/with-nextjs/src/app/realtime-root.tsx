"use client";

import { createRealtimeClient } from "@neon/realtime/client";
import { drizzleParsers } from "@neon/realtime-drizzle/client";
// @neon/realtime-react's build has no "use client" directive: import it only from client modules.
import { RealtimeProvider } from "@neon/realtime-react";
import { type ReactNode, useState } from "react";

export function RealtimeRoot({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  // Creating the client opens no socket, so this is safe during the server render. The socket opens on the
  // first subscribe and closes after the last one ends, so there is no close() effect (under StrictMode, one
  // would close the client for good). StrictMode's dev double mount closes the first socket while it is still
  // connecting, so the dev console logs "WebSocket is closed before the connection is established" (a package
  // gap, harmless).
  const [client] = useState(() =>
    createRealtimeClient({ url, parsers: { ...drizzleParsers } }),
  );
  return <RealtimeProvider client={client}>{children}</RealtimeProvider>;
}
