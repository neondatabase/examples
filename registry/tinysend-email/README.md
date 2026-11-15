# Send email with Tinysend

This Neon Function sends transactional email through [Tinysend](https://tinysend.com/?ref=neon) from one of your Tinysend mailboxes, on tinysend.com or on your own domain.

## Scaffold it

```bash
npm install -g neon@latest
neon login
neon link
neon functions new tinysend-email
```

The CLI writes `functions/tinysendemail/`, declares the function in `neon.ts`, and adds the three environment variables to `.env.example`.

## Configure Tinysend

Create an API key at [app.tinysend.com/account/tokens](https://app.tinysend.com/account/tokens). Every account has a mailbox on tinysend.com to send from; to send from your own domain, add it in Tinysend first.

Add the values to `.env.local` without replacing the Neon values already there:

```bash
cat >> .env.local <<'EOF'
TINYSEND_API_KEY=sk_...
TINYSEND_FROM=you@tinysend.com
EOF
export TINYSEND_FUNCTION_TOKEN=$(openssl rand -hex 32)
echo "TINYSEND_FUNCTION_TOKEN=$TINYSEND_FUNCTION_TOKEN" >> .env.local
```

<EnvironmentVariables>

- `TINYSEND_API_KEY`: An API key (`sk_...`) from app.tinysend.com/account/tokens. Keep it server-side.
- `TINYSEND_FROM`: Optional. The mailbox to send from when a request names none, for example `hello@yourdomain.com`.
- `TINYSEND_FUNCTION_TOKEN`: A random token of at least 32 characters, for example from `openssl rand -hex 32`, that callers send as `Authorization: Bearer <token>`. Neon Function URLs are public, so the function requires it.

</EnvironmentVariables>

## Run locally

```bash
neon dev
```

Call the URL that `neon dev` prints (the default is `http://localhost:8787/`). Send an email:

```bash
curl -s http://localhost:8787/send-email \
  -H "authorization: Bearer $TINYSEND_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -H 'idempotency-key: order-1042-receipt' \
  -d '{
    "to": "grace@example.com",
    "subject": "Your receipt",
    "text": "Thanks for your order."
  }'
```

```json
{
  "id": "01m7ec8zw7jes6gte74fr9bbf1",
  "status": "sent",
  "from": "you@tinysend.com",
  "to": "grace@example.com",
  "subject": "Your receipt",
  "created_at": "2026-11-15T01:13:47.655Z"
}
```

Sending the same `idempotency-key` again returns this answer and sends nothing.

## Routes

<Operations>

| Method | Path | Auth | Body | Result |
| --- | --- | --- | --- | --- |
| `POST` | `/send-email` | Bearer `TINYSEND_FUNCTION_TOKEN` | `{ to, subject, text?, html?, from?, reply_to?, tag?, metadata? }` | `200` with the Tinysend send, or an error |

</Operations>

`to`, `from` and `reply_to` are email addresses, and `from` must be one of your Tinysend mailboxes. Send `text`, `html` or both. `subject` can be up to 998 characters and `tag` up to 120. `metadata` is an object of string values. An `Idempotency-Key` header makes a retry return the first send.

## Deploy

```bash
neon deploy --env .env.local
neon functions get tinysendemail
```

`neon functions get` prints the function's public URL, which you can test with `curl`:

```bash
curl -s https://<function-url>/send-email \
  -H "authorization: Bearer $TINYSEND_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "to": "grace@example.com",
    "subject": "Your receipt",
    "text": "Thanks for your order."
  }'
```

> Replace `<function-url>` with the URL from `neon functions get tinysendemail`.

## Errors

- `400`: a body that is not a JSON object, a missing or invalid field, or neither `text` nor `html`
- `401`: a missing or wrong function token
- `402`: the Tinysend plan's monthly limit is reached
- `413`: a body over 512 KB
- `422`: Tinysend refused the sender or the recipient, with its reason
- `502`: Tinysend rejected the API key, could not be reached, or failed to send
- `503`: `TINYSEND_API_KEY` is unset, or `TINYSEND_FUNCTION_TOKEN` is unset or shorter than 32 characters
