import "./style.css";

import {
  createRealtimeClient,
  type RealtimeClient,
} from "@neon/realtime/client";
import { RealtimeProvider } from "@neon/realtime-react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { Alert, App, type LiveTodosQuery, Page } from "./App.js";
import { getLiveTodos } from "./api.js";

interface Connection {
  readonly attempt: number;
  readonly query?: LiveTodosQuery;
  readonly realtime?: RealtimeClient;
  readonly error?: unknown;
}

// A subscription in `error` stays there, and if the connection failed, so does
// every subscription on its client. So each attempt seals a fresh query and
// opens a new client.
function useConnection(attempt: number): Connection | undefined {
  const [connection, setConnection] = useState<Connection>();

  useEffect(() => {
    let cancelled = false;
    let realtime: RealtimeClient | undefined;

    getLiveTodos().then(
      ({ query, websocketUrl }) => {
        if (cancelled) return;
        realtime = createRealtimeClient({ url: websocketUrl });
        setConnection({ attempt, query, realtime });
      },
      (error: unknown) => {
        if (!cancelled) setConnection({ attempt, error });
      },
    );

    return () => {
      cancelled = true;
      realtime?.close();
    };
  }, [attempt]);

  // Never render the previous attempt, whose client is closed
  return connection?.attempt === attempt ? connection : undefined;
}

function Root() {
  const [attempt, setAttempt] = useState(0);
  const connection = useConnection(attempt);
  const retry = () => setAttempt((current) => current + 1);

  if (connection?.query && connection.realtime) {
    return (
      <RealtimeProvider client={connection.realtime}>
        <App onRetry={retry} query={connection.query} />
      </RealtimeProvider>
    );
  }

  if (connection?.error) {
    return (
      <Page status="error">
        <Alert onRetry={retry}>Could not create the live query</Alert>
      </Page>
    );
  }

  return (
    <Page status="connecting">
      <p>Loading todos</p>
    </Page>
  );
}

const root = document.getElementById("root");

if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
