# Send email with Resend

A Neon Function that sends transactional email through the [Resend](https://resend.com) API.

## Scaffold it

```bash
npm install -g neon@latest
neon login
neon link
neon functions new resend-email
```

The CLI writes `functions/resendemail/index.ts`, declares the function in `neon.ts`, and adds the three environment variables to `.env.example`.

## Configure Resend

Create an API key at [resend.com/api-keys](https://resend.com/api-keys) and verify a sending domain. For a quick test you can use `onboarding@resend.dev`, but Resend only delivers that sender to the account owner's address.

Add the values to `.env.local` without replacing the Neon values already there:

```bash
cat >> .env.local <<'EOF'
RESEND_API_KEY=re_...
RESEND_FROM="Acme <hello@example.com>"
EOF
export RESEND_FUNCTION_TOKEN=$(openssl rand -hex 32)
echo "RESEND_FUNCTION_TOKEN=$RESEND_FUNCTION_TOKEN" >> .env.local
```

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

`html`, `text`, or both are accepted. `to` can be a string or an array of up to 50 addresses; `replyTo` is optional.

## Routes

| Method | Path | Auth | Body | Result |
| --- | --- | --- | --- | --- |
| `GET` | `/` | — | — | The function name and route list |
| `POST` | `/send` | Bearer `RESEND_FUNCTION_TOKEN` | `{ to, subject, html?, text?, replyTo? }` | `200` with the Resend message `id`, or an error |

`to` is a string or an array of up to 50 addresses, the subject is capped at 200 characters on one line, and `html` and `text` are capped at 100,000 characters each. A missing or shorter-than-32-character `RESEND_FUNCTION_TOKEN` returns `503`, a wrong token returns `401`, a malformed body returns `400`, a body over 500,000 bytes returns `413`, and any other path or method returns `404` or `405`.

## Deploy

```bash
neon deploy --env .env.local
neon functions get resendemail
```

`neon functions get` prints the function's public URL. Test it with `curl`:

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

- `RESEND_FUNCTION_TOKEN` is required and must be at least 32 characters. If it is unset or too short, the function returns `503`; a wrong token returns `401`.
- Input is capped at 50 recipients, a 200-character subject, and 100,000 characters each for `html` and `text`.
- The function returns `503` when `RESEND_API_KEY`, `RESEND_FROM`, or a 32+ character `RESEND_FUNCTION_TOKEN` is missing, `401` for a wrong token, and `502` when Resend rejects the message or the API is unavailable.
- Resend's sandbox sender `onboarding@resend.dev` only delivers to the account owner. Use a verified domain for real recipients.
