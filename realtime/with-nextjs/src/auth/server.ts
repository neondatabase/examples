import "server-only";

import { createNeonAuth } from "@neondatabase/auth/next/server";

import { getEnv } from "@/lib/env";

let auth: ReturnType<typeof createNeonAuth> | undefined;
/** Lazy: createNeonAuth checks the cookie secret when constructed, and throws without it. */
export function getAuth() {
  return (auth ??= createNeonAuth({
    baseUrl: getEnv().authBaseUrl,
    cookies: { secret: getEnv().authCookieSecret },
  }));
}

/**
 * The signed-in user, or null. Call it first in every Server Component data path, Server Action and
 * Route Handler: proxy.ts is not the security boundary. Pass the user id the page was loaded for, and a
 * different signed-in user counts as signed out. That id is only compared, never used to scope a query.
 */
export async function getUser(pageUserId?: string) {
  const { data, error } = await getAuth().getSession(); // returns { data, error }; doesn't throw on HTTP errors
  // If Managed Better Auth can't be reached, treat the request as signed out.
  if (error) console.warn("[auth] getSession failed", error.code);
  const user = data?.user ?? null;
  return pageUserId === undefined || user?.id === pageUserId ? user : null;
}
