import { getUser } from "@/auth/server";
import { sealTodos } from "@/lib/todos";

const noStore = { "Cache-Control": "no-store" };

// Renewal is a read, so it's a Route Handler. A Server Action would queue behind pending writes.
// A cross-site POST carries no SameSite=Lax session cookie, so it gets a 401.
export async function POST(request: Request) {
  const { userId } = await request.json(); // the user the page was loaded for
  const user = await getUser(userId);
  if (!user)
    return Response.json(
      { error: "UNAUTHENTICATED" },
      { status: 401, headers: noStore },
    );
  return Response.json(await sealTodos(user.id), { headers: noStore });
}
