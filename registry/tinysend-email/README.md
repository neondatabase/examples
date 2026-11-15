# Send email with Tinysend

This Neon Function sends transactional email through [Tinysend](https://tinysend.com/?ref=neon) from one of your Tinysend mailboxes, on tinysend.com or on your own domain.

<Operations>

| Route | What it does |
| --- | --- |
| `POST /send-email` | Sends one email with `to`, `subject`, and `text`, `html` or both. Add `from` to send from another of your mailboxes, plus `reply_to`, `tag` or `metadata`. An `Idempotency-Key` header makes a retry return the first send. |

</Operations>

## Setup

```bash
neon functions new tinysend-email
```

Create an API key at [app.tinysend.com/account/tokens](https://app.tinysend.com/account/tokens). Every account has a mailbox on tinysend.com to send from; to send from your own domain, add it in Tinysend first.

```bash
echo "TINYSEND_API_KEY=sk_..." >> .env.local
echo "TINYSEND_FROM=you@tinysend.com" >> .env.local
export TINYSEND_FUNCTION_TOKEN=$(openssl rand -hex 32)
echo "TINYSEND_FUNCTION_TOKEN=$TINYSEND_FUNCTION_TOKEN" >> .env.local
neon dev
```

<EnvironmentVariables>

- `TINYSEND_API_KEY`: An API key (`sk_...`) from app.tinysend.com/account/tokens. Keep it server-side.
- `TINYSEND_FROM`: Optional. The mailbox to send from when a request names none, for example `hello@yourdomain.com`.
- `TINYSEND_FUNCTION_TOKEN`: A random token of at least 32 characters, for example from `openssl rand -hex 32`, that callers send as `Authorization: Bearer <token>`. Neon Function URLs are public, so the function requires it.

</EnvironmentVariables>

## Send

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

## Errors

- `400`: a missing `to` or `subject`, or neither `text` nor `html`
- `401`: a missing or wrong function token
- `402`: the Tinysend plan's monthly limit is reached
- `422`: Tinysend refused the sender or the recipient, with its reason
- `502`: Tinysend rejected the API key or could not be reached

To receive email and reply in the same thread, see the `tinysend-inbound` template. For sign-ups with a confirmation email, see `tinysend-signups`.
