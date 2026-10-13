import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getUser } from "@/lib/auth/server";
import { getEnv } from "@/lib/env";
import { loadTodos } from "@/lib/todos";

import { RealtimeRoot } from "./realtime-root";
import { TodoList } from "./todo-list";

export async function Todos() {
  // Request time only. During `next build` connection() never resolves, so nothing below runs at build.
  // The sealed query is a 60 s bearer token for this user's data: never prerender or cache it.
  await connection();
  const user = await getUser();
  // Backstop: proxy.ts already redirected signed-out page loads over HTTP.
  if (!user) redirect("/auth/sign-in");
  const { rows, sealedQuery } = await loadTodos(user.id);
  return (
    // Keyed on the query's identity. A re-render for the same query (router.refresh(), a cookie refresh)
    // keeps the subscription. Another user, or a deploy that changed the SQL, remounts the list (see todo-list.tsx).
    <RealtimeRoot key={sealedQuery.queryFingerprint} url={getEnv().realtimeUrl}>
      <TodoList initialTodos={rows} sealedQuery={sealedQuery} />
    </RealtimeRoot>
  );
}
