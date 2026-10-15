import type { NextRequest } from "next/server";

import { getAuth } from "@/auth/server";

let middleware:
  ReturnType<ReturnType<typeof getAuth>["middleware"]> | undefined;

export default function proxy(request: NextRequest) {
  // Signed-out page loads get an HTTP redirect. Server Actions skip it and return UNAUTHENTICATED themselves.
  if (request.headers.has("next-action")) return;
  middleware ??= getAuth().middleware({ loginUrl: "/auth/sign-in" });
  return middleware(request);
}

// Only the app page. /auth/* is public, and /api/* routes answer 401 themselves. Add new app pages here.
export const config = { matcher: ["/"] };
