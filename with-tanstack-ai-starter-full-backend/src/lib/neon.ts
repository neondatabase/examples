import { createClient } from '@neondatabase/neon-js'
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters'

/**
 * One unified client for both Neon Auth and the Neon Data API.
 *
 * `createClient` derives the auth (`neonauth`) and Data API (`apirest`) URLs from
 * the compute base URL, and, crucially, attaches the signed-in user's JWT to
 * every Data API request. So `neon.from('photos')` and `neon.rpc('match_photos')`
 * run under that user's identity, and Postgres RLS scopes the rows to them.
 *
 * `neon.auth` is the Better Auth client the UI provider and `useSession` use.
 */
const NEON_URL = import.meta.env.VITE_NEON_URL as string

// The neon-js auth types are still beta and lag the runtime in a couple of
// places (the adapter builder-vs-impl shape, `fetchOptions`, and `useSession`
// typed as an atom rather than a hook). The usage below is correct and verified
// end to end. These narrow casts keep `tsc` green until the types catch up.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clientOptions: any = { auth: { adapter: BetterAuthReactAdapter() }, fetchOptions: { credentials: 'include' } }
export const neon = createClient(NEON_URL, clientOptions)

export const authClient = neon.auth as typeof neon.auth & {
  useSession: () => { data: { user?: { email?: string; name?: string } } | null }
}
