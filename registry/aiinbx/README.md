# Send emails with AI Inbx

This Neon Function sends email through [AI Inbx](https://aiinbx.com/).

<Operations>

| Route | What it does |
| --- | --- |
| `POST /send-email` | Sends an AI Inbx send request with `from`, `to`, `subject`, and `html` or `text`. Add `thread_id` to follow up, `scheduled_at` to send later, or `draft` to hold the email for review. |

</Operations>

## Setup

```bash
neon functions new aiinbx
```

In the [AI Inbx console](https://aiinbx.com/app), pick a plan on the **Billing** page under **Settings**, and create an API key with the `sending` scope.

```bash
echo "AI_INBX_API_KEY=..." >> .env.local
export AI_INBX_FUNCTION_TOKEN=$(openssl rand -hex 32)
echo "AI_INBX_FUNCTION_TOKEN=$AI_INBX_FUNCTION_TOKEN" >> .env.local
neon dev
```

<EnvironmentVariables>

- `AI_INBX_API_KEY`: An API key from aiinbx.com/app with the sending scope. Keep it server-side.
- `AI_INBX_FUNCTION_TOKEN`: A random token of at least 32 characters, for example from `openssl rand -hex 32`, that callers send as `Authorization: Bearer <token>`. Neon Function URLs are public, so the function requires it.

</EnvironmentVariables>

## Send

```bash
curl -s http://localhost:8787/send-email \
  -H "authorization: Bearer $AI_INBX_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "from": "Ada <ada@acme.aiinbx.app>",
    "to": "grace@example.com",
    "subject": "Quick question",
    "text": "Does Thursday still work for a call?"
  }'
```

```json
{
  "id": "eml_...",
  "thread_id": "thr_...",
  "status": "queued",
  "scheduled_at": null,
  "review_url": null,
  "suppressed": [],
  "pacing": null
}
```

The function passes the body to AI Inbx unchanged, so it takes any field of an AI Inbx [send request](https://docs.aiinbx.com/guides/sending). It needs `from`, `to`, `subject`, and `html`, `text`, or both. It also takes optional fields such as attachments, unsubscribe headers, and tracking.

`from` must be an address on a domain the workspace sends from or a connected mailbox, and AI Inbx rejects any other sender. Every workspace can send from `<slug>.aiinbx.app` without DNS setup. To send from your own domain, [verify it](https://docs.aiinbx.com/guides/domains), and to send from a Gmail or Outlook account, [connect it](https://docs.aiinbx.com/guides/mailboxes).

AI Inbx also takes these fields:

| Field | Effect |
| --- | --- |
| `thread_id` | Follows up in an earlier email's thread and sets `In-Reply-To` and `References`. |
| `scheduled_at` | Sends at an RFC 3339 time with an offset, up to 30 days ahead. |
| `draft: true` | Holds the email instead of sending it and returns a `review_url` where a person can edit and send it. |

With an `Idempotency-Key` header, a retry that sends the same key returns the first email instead of sending a second one.

`suppressed` lists the recipients that a [suppression list](https://docs.aiinbx.com/guides/suppressions) removed. AI Inbx sets `pacing`, with an estimated send time, when a [sending limit or sending hours](https://docs.aiinbx.com/guides/pacing) apply to the email.

The function passes AI Inbx errors through with their status, [`code`](https://docs.aiinbx.com/reference/errors), `issues`, and `request_id`. If AI Inbx rejects the API key, the function returns `502`.

## Deploy

```bash
neon deploy --env .env.local
neon functions get aiinbx
```
