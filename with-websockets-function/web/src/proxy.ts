import { auth } from "@/lib/auth/server";

export default auth.middleware({ loginUrl: "/auth/sign-in" });

// Only the chat page; /auth/* is public.
export const config = { matcher: ["/"] };
