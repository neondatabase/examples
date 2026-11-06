import { createClient } from '@neon/neon-js'
import { BetterAuthReactAdapter } from '@neon/neon-js/auth/react/adapters'

/**
 * The Neon Auth client, the only piece of neon-js this app uses.
 *
 * `createClient` derives the auth (`neonauth`) URL from the compute base URL and
 * gives back a Better Auth client for sign-up / sign-in / sessions. That's all we
 * need it for: the app does NOT read Postgres through the Data API. Every read and
 * write goes through a server function / API route that verifies this client's JWT
 * and scopes the query to the user (see src/lib/server, src/routes/api).
 *
 * `authClient` (= client.auth) is what `useSession` uses, and
 * what src/lib/auth-token reads the session JWT from.
 */
const NEON_URL = import.meta.env.VITE_NEON_URL as string

const client = createClient(NEON_URL, { auth: { adapter: BetterAuthReactAdapter() } })

export const authClient = client.auth
