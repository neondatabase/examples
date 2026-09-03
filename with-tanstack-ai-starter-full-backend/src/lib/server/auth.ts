import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getToken } from '@/lib/auth-token'
import { requireUser } from '@/lib/verify'

/**
 * Auth for the library server functions (src/lib/server/library.ts).
 *
 * This is the same JWT check the compute API routes do, wrapped as a TanStack
 * function middleware so every server function shares it:
 *   - on the client, attach the Neon Auth JWT as a Bearer header before the call
 *     goes out (getToken reads it from the Neon Auth session cookie);
 *   - on the server, verify that token against the Neon Auth JWKS and put the
 *     resulting user id in `context`, so each handler can scope its query to
 *     `owner_id = context.userId`. Authz here, in the function, no RLS.
 */
export const authMiddleware = createMiddleware({ type: 'function' })
  .client(async ({ next }) => next({ headers: { Authorization: `Bearer ${await getToken()}` } }))
  .server(async ({ next }) => next({ context: { userId: await requireUser(getRequest()) } }))
