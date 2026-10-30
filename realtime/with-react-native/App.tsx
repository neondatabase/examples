import { createRealtimeClient, type RealtimeClient } from "@neon/realtime";
import { drizzleParsers } from "@neon/realtime-drizzle/client";
import { RealtimeProvider } from "@neon/realtime-react";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  ConnectionScreen,
  TodoApp,
  type LiveTodosQuery,
} from "./mobile/TodoApp";
import { getLiveTodos } from "./mobile/api";

const realtimeOrigin =
  process.env.EXPO_PUBLIC_REALTIME_ORIGIN || "http://localhost:5173";

type ReactNativeWebSocketConstructor = new (
  url: string,
  protocols?: string | string[],
  options?: { readonly headers: Readonly<Record<string, string>> },
) => WebSocket;

const ReactNativeWebSocket =
  WebSocket as unknown as ReactNativeWebSocketConstructor;

const createReactNativeWebSocket = (
  url: string,
  protocols: string | string[],
) =>
  new ReactNativeWebSocket(url, protocols, {
    headers: { origin: realtimeOrigin },
  });

interface Connection {
  readonly attempt: number;
  readonly query?: LiveTodosQuery;
  readonly realtime?: RealtimeClient;
  readonly error?: unknown;
}

// A subscription in `error` stays there, and if the connection failed, so does
// every subscription on its client. Each attempt therefore seals a fresh query
// and opens a new client.
function useConnection(attempt: number): Connection | undefined {
  const [connection, setConnection] = useState<Connection>();

  useEffect(() => {
    let cancelled = false;
    let realtime: RealtimeClient | undefined;

    getLiveTodos().then(
      ({ query, websocketUrl }) => {
        if (cancelled) return;
        realtime = createRealtimeClient({
          url: websocketUrl,
          webSocketFactory: createReactNativeWebSocket,
          parsers: { ...drizzleParsers },
          logLevel: __DEV__ ? "debug" : "warn",
        });
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

  return connection?.attempt === attempt ? connection : undefined;
}

function Root() {
  const [attempt, setAttempt] = useState(0);
  const connection = useConnection(attempt);
  const retry = () => setAttempt((current) => current + 1);

  if (connection?.query && connection.realtime) {
    return (
      <RealtimeProvider client={connection.realtime}>
        <TodoApp onRetry={retry} query={connection.query} />
      </RealtimeProvider>
    );
  }

  if (connection?.error) {
    return (
      <ConnectionScreen
        message="Could not create the live query"
        onRetry={retry}
        status="error"
      />
    );
  }

  return <ConnectionScreen message="Loading todos" status="connecting" />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Root />
    </SafeAreaProvider>
  );
}
