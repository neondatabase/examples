# Send email with Resend

This Neon Function sends transactional email through the [Resend](https://resend.com) API.

## Scaffold it

```bash
npm install -g neon@latest
neon login
neon link
neon functions new resend-email
```

The CLI writes `functions/resendemail/index.ts`, declares the function in `neon.ts`, and adds the three environment variables to `.env.example`.

## Configure Resend

Create an API key at [resend.com/api-keys](https://resend.com/api-keys) and verify a sending domain. For a quick test, you can send from `onboarding@resend.dev`, but Resend only delivers mail from that sender to the account owner's address.

Add the values to `.env.local` without replacing the Neon values already there:

```bash
cat >> .env.local <<'EOF'
RESEND_API_KEY=re_...
RESEND_FROM="Acme <hello@example.com>"
EOF
export RESEND_FUNCTION_TOKEN=$(openssl rand -hex 32)
echo "RESEND_FUNCTION_TOKEN=$RESEND_FUNCTION_TOKEN" >> .env.local
```

<EnvironmentVariables>

- `RESEND_API_KEY`: An API key from resend.com/api-keys with permission to send email.
- `RESEND_FROM`: A verified sender address, for example `Acme <hello@example.com>`.
- `RESEND_FUNCTION_TOKEN`: A random token of at least 32 characters, for example from `openssl rand -hex 32`, that callers send as `Authorization: Bearer <token>`. Neon Function URLs are public, so the function requires it.

</EnvironmentVariables>

## Run locally

```bash
neon dev
```

Call the URL that `neon dev` prints (the default is `http://localhost:8787/`). Send an email:

```bash
curl -s http://localhost:8787/send \
  -H "authorization: Bearer $RESEND_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "to": "you@example.com",
    "subject": "Hello from Neon",
    "text": "This was sent by a Neon Function."
  }'
```

```json
{ "id": "4ef9a417-02e9-4d39-ad75-9611e0fcc33c" }
```

The body takes `html`, `text`, or both. `to` can be a string or an array of up to 50 addresses, and `replyTo` is optional.

## Routes

<Operations>

| Method | Path | Auth | Body | Result |
| --- | --- | --- | --- | --- |
| `GET` | `/` | None | None | The function name and route list |
| `POST` | `/send` | Bearer `RESEND_FUNCTION_TOKEN` | `{ to, subject, html?, text?, replyTo? }` | `200` with the Resend message `id`, or an error |

</Operations>

`to` is a string or an array of up to 50 addresses. The subject can be up to 200 characters on one line, and `html` and `text` can be up to 100,000 characters each. A missing or shorter-than-32-character `RESEND_FUNCTION_TOKEN` returns `503`, a wrong token returns `401`, a malformed body returns `400`, a body over 500,000 bytes returns `413`, and any other path or method returns `404` or `405`.

## Deploy

```bash
neon deploy --env .env.local
neon functions get resendemail
```

`neon functions get` prints the function's public URL, which you can test with `curl`:

```bash
curl -s https://<function-url>/send \
  -H "authorization: Bearer $RESEND_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "to": "you@example.com",
    "subject": "Hello from Neon",
    "text": "This was sent by a Neon Function."
  }'
```

> Replace `<function-url>` with the URL from `neon functions get resendemail`.

## Notes

- `RESEND_FUNCTION_TOKEN` is required and must be at least 32 characters. If it is unset or too short, the function returns `503`, and a wrong token returns `401`.
- The function caps input at 50 recipients, a 200-character subject, and 100,000 characters each for `html` and `text`.
- The function returns `503` when `RESEND_API_KEY`, `RESEND_FROM`, or a 32+ character `RESEND_FUNCTION_TOKEN` is missing, `401` for a wrong token, and `502` when Resend rejects the message or the API is unavailable.
- Resend's sandbox sender `onboarding@resend.dev` only delivers to the account owner. Use a verified domain for real recipients.
