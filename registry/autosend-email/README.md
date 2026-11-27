# Send email with AutoSend

This Neon Function sends transactional email through [AutoSend](https://autosend.com), from an AutoSend [email template](https://docs.autosend.com/transactional-emails/email-templates) or from HTML and text you pass in. It also records AutoSend [events](https://docs.autosend.com/automations/events), which can start automations.

## Scaffold it

```bash
npm install -g neon@latest
neon login
neon link
neon functions new autosend-email
```

The CLI writes `functions/autosendemail/`, declares the function in `neon.ts`, and adds the three environment variables to `.env.example`.

## Configure AutoSend

In AutoSend, [verify a sending domain](https://docs.autosend.com/domain) and create a project API key, which starts with `AS_`. To send with a template, create it in AutoSend and copy its ID, which starts with `A-`. To use `/send-event`, create the event in AutoSend first, because the Send Event API rejects event names and properties the event doesn't declare.

Add the values to `.env.local` without replacing the Neon values already there:

```bash
cat >> .env.local <<'ENV'
AUTOSEND_API_KEY=AS_...
AUTOSEND_FROM="Acme <hello@mail.example.com>"
ENV
export AUTOSEND_FUNCTION_TOKEN=$(openssl rand -hex 32)
echo "AUTOSEND_FUNCTION_TOKEN=$AUTOSEND_FUNCTION_TOKEN" >> .env.local
```

The CLI declares each variable in `neon.ts` as `process.env.<NAME>!`, so `neon.ts` doesn't load while any of them is unset. If every request sets `from` and you leave `AUTOSEND_FROM` out, make its declaration optional:

```ts
AUTOSEND_FROM: { value: process.env.AUTOSEND_FROM, required: false },
```

<EnvironmentVariables>

- `AUTOSEND_API_KEY`: A project API key from your AutoSend project's API keys settings, which starts with `AS_` and must stay on the server.
- `AUTOSEND_FROM`: Optional. The sender on a verified domain to use when a `/send-email` request doesn't set `from`, for example `Acme <hello@mail.example.com>`.
- `AUTOSEND_FUNCTION_TOKEN`: A random token of at least 32 characters, for example from `openssl rand -hex 32`, that callers send as `Authorization: Bearer <token>`. Neon Function URLs are public, so the function requires it.

</EnvironmentVariables>

## Run locally

```bash
neon dev
```

Call the URL that `neon dev` prints, which defaults to `http://localhost:8787/`. Send an email from a template, with `dynamicData` filling the template's `{{variables}}`:

```bash
curl -s http://localhost:8787/send-email \
  -H "authorization: Bearer $AUTOSEND_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "to": { "email": "grace@example.com", "name": "Grace" },
    "templateId": "A-abc123",
    "dynamicData": { "firstName": "Grace" }
  }'
```

```json
{ "emailId": "698afb75ff4bc5466e3a797a" }
```

To send your own content, pass `subject` with `html`, `text`, or both instead of `templateId`:

```bash
curl -s http://localhost:8787/send-email \
  -H "authorization: Bearer $AUTOSEND_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "to": "grace@example.com",
    "subject": "Your receipt",
    "text": "Thanks for your order."
  }'
```

Record an event for a contact. AutoSend creates the contact if no contact has that email yet:

```bash
curl -s http://localhost:8787/send-event \
  -H "authorization: Bearer $AUTOSEND_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "email": "grace@example.com",
    "eventName": "signup_completed",
    "eventProperties": { "plan": "pro" }
  }'
```

```json
{ "eventId": "60d5ec49f1b2c72d9c8b9999", "contactId": "60d5ec49f1b2c72d9c8b8888" }
```

To send email when the event arrives, create an [automation](https://docs.autosend.com/automations) with the **Event received** trigger for `signup_completed`.

## Routes

<Operations>

| Method | Path | Auth | Body | Result |
| --- | --- | --- | --- | --- |
| `POST` | `/send-email` | Bearer `AUTOSEND_FUNCTION_TOKEN` | `{ to, templateId?, dynamicData?, subject?, html?, text?, from?, replyTo? }` | `200` with the AutoSend `emailId`, or an error |
| `POST` | `/send-event` | Bearer `AUTOSEND_FUNCTION_TOKEN` | `{ email?, contactId?, eventName, eventProperties? }` | `200` with the `eventId` and `contactId`, or an error |

</Operations>

`to`, `from`, and `replyTo` each take an address (`grace@example.com`), a name and address (`Grace <grace@example.com>`), or an object (`{ "email": "grace@example.com", "name": "Grace" }`), and `from` must be on a domain you verified in AutoSend. `/send-email` needs a `templateId`, or a `subject` with `html` or `text`. With a template, AutoSend uses the template's subject and ignores `subject`, and it still sends when `dynamicData` leaves out a variable, which then renders empty.

`/send-event` needs `email`, `contactId`, or both, and an `eventName` of up to 64 letters, digits, and underscores. `eventProperties` is a flat object of strings, numbers, and booleans, and each key and value type must match the event's declared properties.

## Deploy

```bash
neon deploy --env .env.local
neon functions get autosendemail
```

`neon functions get` prints the function's public URL, which you can test with `curl`:

```bash
curl -s https://<function-url>/send-email \
  -H "authorization: Bearer $AUTOSEND_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "to": "grace@example.com",
    "subject": "Hello from Neon",
    "text": "This was sent by a Neon Function."
  }'
```

> Replace `<function-url>` with the URL from `neon functions get autosendemail`.

## Errors

- `400`: a body that is not a JSON object, or a missing or invalid field
- `401`: a missing or wrong function token
- `404`: a path other than `/send-email` or `/send-event`
- `405`: a method other than `POST`
- `413`: a body over 500,000 bytes for `/send-email` or 100,000 bytes for `/send-event`
- `422`: AutoSend refused the request, for example with `TEMPLATE_NOT_FOUND`, `INVALID_EMAIL_SENDER` for a sender outside your verified domains, `EVENT_NOT_FOUND`, or `UNKNOWN_PROPERTY`. The response carries AutoSend's `error` and `code`.
- `429`: AutoSend rate-limited the request, and the response passes on `Retry-After` when AutoSend sends it
- `502`: AutoSend rejected the API key, returned another error, or could not be reached
- `503`: `AUTOSEND_API_KEY` is unset, or `AUTOSEND_FUNCTION_TOKEN` is unset or shorter than 32 characters

The function logs each AutoSend error as `[autosend-email] <status> <code>: <message>`. It doesn't retry, and the AutoSend Send Email API doesn't deduplicate repeated requests, so retrying a `502` or a timeout can send the email twice.

To store AutoSend delivery, bounce, and unsubscribe events in Postgres, see [Store AutoSend webhook events in Neon](https://neon.com/guides/autosend-webhooks).
