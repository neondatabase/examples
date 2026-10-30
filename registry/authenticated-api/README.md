# Authenticated API with Hono and Managed Better Auth

A protected [Hono](https://hono.dev) API for a [Neon Function](https://neon.com/docs/compute/functions/overview). `GET /me` requires a [Managed Better Auth](https://neon.com/docs/auth/overview) JWT and returns the caller's identity. Requests without a valid token get `401`.

- [Hono](https://hono.dev) handles routing, CORS, and JSON responses. [`jose`](https://github.com/panva/jose) verifies the EdDSA-signed token against the branch's JWKS and checks the issuer and audience.
- `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL` are injected by Neon when Managed Better Auth is enabled on the branch.

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new authenticated-api --slug authapi
```

The CLI writes `functions/authapi/index.ts`, declares `authapi` in `neon.ts`, and installs its dependencies.

## Enable Managed Better Auth

The scaffolded `neon.ts` sets `auth: false` by default. Change it to `true`, then apply the policy:

```ts
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  functions: {
    "authapi": {
      name: "Authenticated API with Hono and Managed Better Auth",
      source: "./functions/authapi/index.ts",
    },
  },
});
```

```bash
neon deploy
```

`neon deploy` enables Managed Better Auth on the linked branch, deploys the function, and pulls `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL` into your local env file (`.env.local` when there is no `.env`).

## Run locally

```bash
neon dev
```

The root endpoint is public. Without a token, `GET /me` returns `401`:

```bash
curl -i http://localhost:8787/
curl -i http://localhost:8787/me
```

To get a token, sign in with the [Managed Better Auth SDK](https://neon.com/docs/auth/quick-start/react) and call `authClient.token()`:

```ts
import { authClient } from "./auth";

const { data, error } = await authClient.token();
if (error) throw error;
const token = data.token;
```

Managed Better Auth tokens expire after 15 minutes. Request a fresh one with `authClient.token()` instead of caching it.

```bash
curl http://localhost:8787/me \
  -H "authorization: Bearer $TOKEN"
```

```json
{
  "user": {
    "id": "860dc360-609f-4b7d-9e70-ec93fe6414d3",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

## Routes

| Method | Path  | Auth | Result |
| --- | --- | --- | --- |
| `GET` | `/` | — | The API name and the protected route |
| `GET` | `/me` | Bearer JWT | The verified caller's `id`, `email`, and `name`, or `401` |

The `/me` route is a simple example. In a real API, you would have more complex routes and business logic.

Use the verified `user.id` from the token to scope queries and writes. Never trust a user id supplied in a request body or query string.

> [!NOTE]
> CORS is open to every origin so a browser can call the function directly. In production, pass your app's domain to Hono's [`cors` middleware](https://hono.dev/docs/middleware/builtin/cors) instead, for example `cors({ origin: "https://example.com" })`. See [Neon Functions authentication](https://neon.com/docs/compute/functions/authentication#call-a-function-directly-from-the-client).
