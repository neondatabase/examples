import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getUser } from "@/auth/server";
import { UserMenu } from "@/auth/user-menu";
import { getEnv } from "@/lib/env";
import { loadTodos } from "@/lib/todos";

import { RealtimeRoot } from "./realtime-root";
import { TodoList } from "./todo-list";

export async function Todos() {
  // Request time only. During `next build` connection() never resolves, so nothing below runs at build.
  // The sealed query is a bearer token for this user's data: never prerender or cache it.
  await connection();
  const user = await getUser();
  // Backstop: proxy.ts already redirected signed-out page loads over HTTP.
  if (!user) redirect("/auth/sign-in");
  const { rows, sealedQuery } = await loadTodos(user.id);
  return (
    <>
      {/* Here rather than in page.tsx, which has no data access. */}
      <UserMenu email={user.email} />
      {/* Keyed on the query's identity. A re-render for the same query (router.refresh(), a cookie refresh)
          keeps the subscription. A deploy that changed the SQL remounts the list. */}
      <RealtimeRoot
        key={sealedQuery.queryFingerprint}
        url={getEnv().realtimeUrl}
      >
        <TodoList
          initialTodos={rows}
          sealedQuery={sealedQuery}
          userId={user.id}
        />
      </RealtimeRoot>
    </>
  );
}
