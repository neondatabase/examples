import { getAuth } from "@/auth/server";

// The catch-all MUST be named `path`: the handler reads params.path.
// Lazy form of `export const { GET, POST } = auth.handler()`, so `next build` needs no cookie secret.
type Context = { params: Promise<{ path: string[] }> };
let handlers: ReturnType<ReturnType<typeof getAuth>["handler"]> | undefined;
const h = () => (handlers ??= getAuth().handler());

export const GET = (request: Request, context: Context) =>
  h().GET(request, context);
export const POST = (request: Request, context: Context) =>
  h().POST(request, context);
