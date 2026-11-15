# Send email with Groundmail

This Neon Function sends transactional email through [Groundmail](https://groundmail.dev/?utm_source=neon&utm_medium=template&utm_campaign=neon-functions) from your own domain, with HTML, text or a saved template.

## Scaffold it

```bash
npm install -g neon@latest
neon login
neon link
neon functions new groundmail-email
```

The CLI writes `functions/groundmailemail/`, declares the function in `neon.ts`, and adds the three environment variables to `.env.example`.

## Configure Groundmail

Create an API key at [app.groundmail.dev/api-keys](https://app.groundmail.dev/api-keys) and verify the domain you send from. A `gm_test_` key runs every send through validation and templates without delivering anything, which is handy while you build.

Add the values to `.env.local` without replacing the Neon values already there:

```bash
cat >> .env.local <<'ENV'
GROUNDMAIL_API_KEY=gm_...
GROUNDMAIL_FROM=Acme <hello@yourdomain.com>
ENV
export GROUNDMAIL_FUNCTION_TOKEN=$(openssl rand -hex 32)
echo "GROUNDMAIL_FUNCTION_TOKEN=$GROUNDMAIL_FUNCTION_TOKEN" >> .env.local
```

<EnvironmentVariables>

- `GROUNDMAIL_API_KEY`: An API key (`gm_...`) from app.groundmail.dev/api-keys. A `gm_test_` key sends nothing. Keep it server-side.
- `GROUNDMAIL_FROM`: Optional. The sender to use when a request names none, on a verified domain, for example `Acme <hello@yourdomain.com>`.
- `GROUNDMAIL_FUNCTION_TOKEN`: A random token of at least 32 characters, for example from `openssl rand -hex 32`, that callers send as `Authorization: Bearer <token>`. Neon Function URLs are public, so the function requires it.

</EnvironmentVariables>

## Run locally

```bash
neon dev
```

Call the URL that `neon dev` prints (the default is `http://localhost:8787/`). Send an email:

```bash
curl -s http://localhost:8787/send-email \
  -H "authorization: Bearer $GROUNDMAIL_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -H 'idempotency-key: order-1042-receipt' \
  -d '{
    "to": "grace@example.com",
    "subject": "Your receipt",
    "html": "<p>Thanks for your order.</p>"
  }'
```

```json
{
  "id": "msg_9169dde46f4d1eccb37ffc29",
  "status": "sent"
}
```

Sending the same `idempotency-key` again within 24 hours returns this answer and sends nothing.

To send a template you saved in Groundmail, pass its id or alias and its variables instead of `html` and `text`. The template's subject is used unless you send one:

```bash
curl -s http://localhost:8787/send-email \
  -H "authorization: Bearer $GROUNDMAIL_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "to": "grace@example.com",
    "template": { "id": "welcome", "variables": { "name": "Grace" } }
  }'
```

To try the function without sending to a real inbox, send to `delivered@simulator.groundmail.dev` (or `bounce@`, `complaint@`). Simulator addresses produce that outcome and never leave Groundmail.

## Routes

<Operations>

| Method | Path | Auth | Body | Result |
| --- | --- | --- | --- | --- |
| `POST` | `/send-email` | Bearer `GROUNDMAIL_FUNCTION_TOKEN` | `{ to, subject?, html?, text?, template?, from?, reply_to?, tags? }` | `200` with the Groundmail send, or an error |

</Operations>

`to` and `reply_to` are one email address or a list (up to 50 for `to`). `from` must be on a domain you verified in Groundmail. Send `html`, `text` or both, or a `template` of `{ id, variables? }`. `subject` is required unless the template supplies it. `tags` is an object of string values you can filter by in Groundmail. An `Idempotency-Key` header makes a retry return the first send.

## Deploy

```bash
neon deploy --env .env.local
neon functions get groundmailemail
```

`neon functions get` prints the function's public URL, which you can test with `curl`:

```bash
curl -s https://<function-url>/send-email \
  -H "authorization: Bearer $GROUNDMAIL_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "to": "grace@example.com",
    "subject": "Your receipt",
    "text": "Thanks for your order."
  }'
```

> Replace `<function-url>` with the URL from `neon functions get groundmailemail`.

## Errors

- `400`: a body that is not a JSON object, a missing or invalid field, or no `html`, `text` or `template`
- `401`: a missing or wrong function token
- `413`: a body over 512 KB
- `403`, `404`, `422` and other `4xx`: Groundmail refused the send (for example a sender domain you haven't verified, or an unknown template), with its `error`, `code` and `hint`
- `502`: Groundmail rejected the API key (or the key lacks send permission), or could not be reached
- `503`: `GROUNDMAIL_API_KEY` is unset, or `GROUNDMAIL_FUNCTION_TOKEN` is unset or shorter than 32 characters
