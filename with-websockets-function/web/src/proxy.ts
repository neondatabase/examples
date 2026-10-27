import { auth } from "@/lib/auth/server";

export default auth.middleware({ loginUrl: "/auth/sign-in" });

// Only the chat page. /auth/* is public, and /api/* routes answer 401 themselves.
export const config = { matcher: ["/"] };
