import { createNeonAuth } from "@neon/auth/next/server";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

let auth: ReturnType<typeof createNeonAuth> | undefined;
/** Lazy: createNeonAuth checks the cookie secret when constructed, and throws without it, which would fail `next build`. */
export function getAuth() {
  return (auth ??= createNeonAuth({
    baseUrl: requireEnv("NEON_AUTH_BASE_URL"),
    cookies: { secret: requireEnv("NEON_AUTH_COOKIE_SECRET") },
  }));
}
