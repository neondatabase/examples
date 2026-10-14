import { getEnv } from "@/env";
import { getRealtime } from "@/realtime";
import { selectTodos } from "@/todos";

import { TodosClient } from "./todos-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const env = getEnv();
  const [initialTodos, query] = await Promise.all([
    selectTodos(),
    getRealtime().seal({ query: selectTodos() }),
  ]);

  return (
    <TodosClient
      initialTodos={initialTodos}
      query={query}
      websocketUrl={env.realtimeUrl}
    />
  );
}
