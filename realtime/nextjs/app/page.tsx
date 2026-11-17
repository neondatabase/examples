import { realtime } from "../lib/realtime";
import { allTodos } from "../lib/todos";
import { TodosClient } from "./todos-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [initialTodos, query] = await Promise.all([
    allTodos(),
    realtime.seal({ query: allTodos() }),
  ]);

  return <TodosClient query={query} initialTodos={initialTodos} />;
}
