# Authenticated API with Hono and Managed Better Auth

This template is a protected [Hono](https://hono.dev) API that runs as a [Neon Function](https://neon.com/docs/compute/functions/overview). `GET /me` requires a [Managed Better Auth](https://neon.com/docs/auth/overview) JWT and returns the caller's identity. A request without a valid token gets `401`.

- [Hono](https://hono.dev) handles routing, CORS, and JSON responses. [`jose`](https://github.com/panva/jose) verifies the EdDSA-signed token against the branch's JWKS and checks the issuer and audience.
- Neon injects `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL` when you enable Managed Better Auth on the branch.

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

The scaffolded `neon.ts` sets `auth: false` by default, so change it to `true` and then apply the policy:

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

The root endpoint is public, but `GET /me` returns `401` without a token:

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

<Operations>

| Method | Path  | Auth | Result |
| --- | --- | --- | --- |
| `GET` | `/` | None | The API name and the protected route |
| `GET` | `/me` | Bearer JWT | The verified caller's `id`, `email`, and `name`, or `401` |

</Operations>

`/me` only returns the caller's identity. In the routes you add, scope queries and writes with the verified `user.id` from the token, and never trust a user id from a request body or query string.

> [!NOTE]
> The function allows CORS from every origin, so a browser can call it directly. In production, pass your app's domain to Hono's [`cors` middleware](https://hono.dev/docs/middleware/builtin/cors) instead, for example `cors({ origin: "https://example.com" })`. See [Neon Functions authentication](https://neon.com/docs/compute/functions/authentication#call-a-function-directly-from-the-client).
