import type { NextRequest } from "next/server";

import { getAuth } from "@/lib/auth/server";

let middleware: ReturnType<ReturnType<typeof getAuth>["middleware"]> | undefined;

export default function proxy(request: NextRequest) {
  middleware ??= getAuth().middleware({ loginUrl: "/auth/sign-in" });
  return middleware(request);
}

// Only the chat page; /auth/* is public.
export const config = { matcher: ["/"] };
