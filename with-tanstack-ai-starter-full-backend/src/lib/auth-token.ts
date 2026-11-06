/**
 * Fetch the current Neon Auth JWT in the browser.
 *
 * Neon Auth sets its session cookie on its own origin (VITE_NEON_AUTH_URL), a
 * different host from the app, so the app's server can't read it directly. The
 * browser exchanges that cookie for a short-lived JWT here, and passes it as a
 * Bearer token to the server functions (via the auth middleware) and the compute
 * API routes (upload / embed / caption / faces). The server verifies it against
 * the Neon Auth JWKS and takes the user id from the token's `sub`.
 */
const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL as string

export async function getToken(): Promise<string> {
  const res = await fetch(`${AUTH_URL}/token`, { credentials: 'include' })
  const data = (await res.json()) as { token?: string }
  if (!data.token) throw new Error('not signed in')
  return data.token
}
