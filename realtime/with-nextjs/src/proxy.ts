import type { NextRequest } from "next/server";

import { getAuth } from "@/lib/auth/server";

let middleware:
  ReturnType<ReturnType<typeof getAuth>["middleware"]> | undefined;

export default function proxy(request: NextRequest) {
  // Server Actions check the session themselves and return { kind: "rejected", reason: "UNAUTHENTICATED" }.
  // A redirect here would reach the client as an unexplained failure.
  if (request.headers.has("next-action")) return;
  // Refreshes the session cookies and sends signed-out page loads a real HTTP redirect (a redirect() inside
  // <Suspense> only happens in the browser). Not the security boundary: every data path calls getUser().
  middleware ??= getAuth().middleware({ loginUrl: "/auth/sign-in" });
  return middleware(request);
}

// Only the app page. /auth/* is public, and /api/* routes answer 401 themselves. Add new app pages here.
export const config = { matcher: ["/"] };
