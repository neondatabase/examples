import { createClient } from '@neondatabase/neon-js'
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters'

/**
 * The Neon Auth client, the only piece of neon-js this app uses.
 *
 * `createClient` derives the auth (`neonauth`) URL from the compute base URL and
 * gives back a Better Auth client for sign-up / sign-in / sessions. That's all we
 * need it for: the app does NOT read Postgres through the Data API. Every read and
 * write goes through a server function / API route that verifies this client's JWT
 * and scopes the query to the user (see src/lib/server, src/routes/api).
 *
 * `authClient` (= client.auth) is what the UI provider and `useSession` use, and
 * what src/lib/auth-token reads the session JWT from.
 */
const NEON_URL = import.meta.env.VITE_NEON_URL as string

// The neon-js auth types are still beta and lag the runtime in a couple of
// places (the adapter builder-vs-impl shape, `fetchOptions`, and `useSession`
// typed as an atom rather than a hook). The usage below is correct and verified
// end to end. These narrow casts keep `tsc` green until the types catch up.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clientOptions: any = { auth: { adapter: BetterAuthReactAdapter() }, fetchOptions: { credentials: 'include' } }
const client = createClient(NEON_URL, clientOptions)

export const authClient = client.auth as typeof client.auth & {
  useSession: () => { data: { user?: { email?: string; name?: string } } | null }
}
