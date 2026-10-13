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
 * Route Handler: proxy.ts is not the security boundary. Never accept a user id from the client.
 */
export async function getUser() {
  const { data, error } = await getAuth().getSession(); // returns { data, error }; doesn't throw on HTTP errors
  // An Auth outage is an error, not "signed out" (treating it as signed out causes redirect loops).
  if (error && (error.status ?? 0) >= 500)
    throw new Error(`Neon Auth is unavailable: ${error.message}`);
  return data?.user ?? null;
}
