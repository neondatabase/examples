import { realtime } from "../../../../lib/realtime";
import { allTodos } from "../../../../lib/todos";

export async function GET() {
  return Response.json(await realtime.seal({ query: allTodos() }));
}
