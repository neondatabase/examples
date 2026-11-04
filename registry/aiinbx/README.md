# Send emails with AI Inbx

A Neon Function that sends email through [AI Inbx](https://aiinbx.com).

## Setup

```bash
neon functions new aiinbx
```

In the [AI Inbx console](https://aiinbx.com/app), pick a plan under **Settings → Billing** and create an API key with the `sending` scope.

```bash
echo "AI_INBX_API_KEY=..." >> .env.local
export AI_INBX_FUNCTION_TOKEN=$(openssl rand -hex 32)
echo "AI_INBX_FUNCTION_TOKEN=$AI_INBX_FUNCTION_TOKEN" >> .env.local
neon dev
```

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

The body is an AI Inbx [send request](https://docs.aiinbx.com/guides/sending), passed on as is: `from`, `to`, `subject` and `html` and/or `text`, plus any other field AI Inbx takes, such as attachments, unsubscribe headers or tracking.

`from` can be any address on a domain the workspace sends from or a connected mailbox; AI Inbx rejects the rest. Every workspace can send from `<slug>.aiinbx.app` without DNS setup. To send from your own domain, [verify it](https://docs.aiinbx.com/guides/domains); to send from a Gmail or Outlook account, [connect it](https://docs.aiinbx.com/guides/mailboxes).

A few AI Inbx extras:

| Field | Effect |
| --- | --- |
| `thread_id` | Follows up in an earlier email's thread, with `In-Reply-To` and `References` set. |
| `scheduled_at` | Sends at an RFC 3339 time with an offset, up to 30 days out. |
| `draft: true` | Sends nothing; returns a `review_url` where a person edits and sends it. |

An `Idempotency-Key` header makes retries safe: a retry with the same key returns the first email instead of sending it twice.

`suppressed` lists recipients dropped by a [suppression list](https://docs.aiinbx.com/guides/suppressions). `pacing` is set when a [sending limit or sending hours](https://docs.aiinbx.com/guides/pacing) apply to the email, with an estimated send time.

Errors from AI Inbx keep their status, [`code`](https://docs.aiinbx.com/reference/errors), `issues` and `request_id`. A rejected API key returns `502`.

## Deploy

```bash
neon deploy --env .env.local
neon functions get aiinbx
```
