import { createRemoteJWKSet, jwtVerify } from 'jose'

/**
 * Server-side JWT verification for the app's own routes (upload / presign /
 * embed). The browser sends the Neon Auth JWT as a Bearer token, and we verify it
 * against the Neon Auth JWKS and return the `sub` (the user id). Everything that
 * writes or signs is gated on this, the routes never trust a client-supplied
 * owner id, only the verified `sub`.
 *
 * Reads don't come through here: those go browser -> Data API, where Postgres
 * RLS does the enforcing. This is only for the compute/signing side.
 */
const JWKS_URL = process.env.JWKS_URL
if (!JWKS_URL) throw new Error('JWKS_URL is not set')
const jwks = createRemoteJWKSet(new URL(JWKS_URL))

export class Unauthorized extends Error {}

/** Returns the verified user id (JWT `sub`), or throws Unauthorized. */
export async function requireUser(request: Request): Promise<string> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw new Unauthorized('missing bearer token')
  try {
    const { payload } = await jwtVerify(token, jwks)
    const sub = payload.sub
    if (!sub) throw new Unauthorized('token has no subject')
    return sub
  } catch {
    throw new Unauthorized('invalid token')
  }
}
