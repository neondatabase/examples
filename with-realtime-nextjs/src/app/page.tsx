import { env } from "@/env";
import { realtime } from "@/realtime";
import { selectTodos } from "@/todos";

import { TodosClient } from "./todos-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [initialTodos, query] = await Promise.all([
    selectTodos(),
    realtime.seal({ query: selectTodos() }),
  ]);

  return (
    <TodosClient
      initialTodos={initialTodos}
      query={query}
      websocketUrl={env.realtime.url}
    />
  );
}
