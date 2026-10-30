# with-websockets-function (web)

This is the Next.js frontend for the WebSocket chat example. It uses Neon Auth for sign-in and talks over WebSockets to the Hono server that runs on Neon Functions.

This app is not meant to be run on its own. Follow the setup and run steps in the [parent README](../README.md), which covers the server, the database, and this web app together.

## Updating the auth UI components

The auth components are vendored from the Better Auth UI shadcn registry. `src/components/auth/auth-redirect.tsx` carries a local patch that rejects redirect targets normalizing to `//host`: upstream `getSafeRedirectTo` in `@better-auth-ui/core` 1.7.30 can return `//host` for inputs like `/a/..//host`, which a browser treats as another site. After re-running `npx shadcn add …`, re-apply that patch until it's fixed upstream.
