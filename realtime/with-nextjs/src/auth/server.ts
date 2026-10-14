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
  // If Neon Auth can't be reached, treat the request as signed out.
  if (error) console.warn("[auth] getSession failed", error.code);
  return data?.user ?? null;
}
