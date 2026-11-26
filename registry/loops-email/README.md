# Send email with Loops

This Neon Function sends [Managed Better Auth](https://neon.com/docs/auth/overview) sign-in codes and links as [Loops](https://loops.so) transactional emails, adds each new user to your Loops audience, and sends Loops events that start workflows.

## Scaffold it

```bash
npm install -g neon@latest
neon login
neon link
neon functions new loops-email --all-operations
neon config add auth
```

The CLI writes `functions/loopsemail/`, declares the function in `neon.ts`, and adds the eight environment variables to `.env.example`. `neon config add auth` declares Managed Better Auth, which adds the `NEON_AUTH_JWKS_URL` the function needs to verify each webhook. If you only need the webhook, leave out `--all-operations`.

## Configure Loops

Verify a [sending domain](https://loops.so/docs/sending-domain) and create an API key in [API settings](https://app.loops.so/settings?page=api). Then [create and publish a transactional email](https://loops.so/docs/transactional) for each Managed Better Auth email your app sends, using the data variable listed below, and copy its **Transactional ID**.

Add the values to `.env.local` without replacing the Neon values already there:

```bash
cat >> .env.local <<'EOF'
LOOPS_API_KEY=your-loops-api-key
LOOPS_OTP_SIGNIN_TRANSACTIONAL_ID=your-transactional-id
LOOPS_MAGIC_LINK_TRANSACTIONAL_ID=your-transactional-id
EOF
export LOOPS_FUNCTION_TOKEN=$(openssl rand -hex 32)
echo "LOOPS_FUNCTION_TOKEN=$LOOPS_FUNCTION_TOKEN" >> .env.local
```

The CLI declares each variable in `neon.ts` as `process.env.<NAME>!`, so `neon deploy` fails while any of them is unset. Make the declaration optional for each transactional ID you leave out, and for `LOOPS_FUNCTION_TOKEN` if you skip `/send-event`:

```ts
LOOPS_VERIFY_EMAIL_TRANSACTIONAL_ID: { value: process.env.LOOPS_VERIFY_EMAIL_TRANSACTIONAL_ID, required: false },
```

<EnvironmentVariables>

- `LOOPS_API_KEY`: An API key from Loops API settings, which must stay on the server.
- `LOOPS_OTP_SIGNIN_TRANSACTIONAL_ID`: The Loops email for sign-in codes, which uses the `otpCode` data variable.
- `LOOPS_OTP_VERIFICATION_TRANSACTIONAL_ID`: The Loops email for email verification codes, which uses `otpCode`.
- `LOOPS_OTP_PASSWORD_RESET_TRANSACTIONAL_ID`: The Loops email for password reset codes, which uses `otpCode`.
- `LOOPS_MAGIC_LINK_TRANSACTIONAL_ID`: The Loops email for magic sign-in links, which uses `magicLinkUrl`.
- `LOOPS_VERIFY_EMAIL_TRANSACTIONAL_ID`: The Loops email for email verification links, which uses `verificationUrl`.
- `LOOPS_RESET_PASSWORD_TRANSACTIONAL_ID`: The Loops email for password reset links, which uses `resetPasswordUrl`.
- `LOOPS_FUNCTION_TOKEN`: A random token that callers send to `/send-event` as `Authorization: Bearer <token>`, and only that route reads it. Neon Function URLs are public, so the route requires a token of at least 32 characters, such as one from `openssl rand -hex 32`.

</EnvironmentVariables>

## Run locally

```bash
neon dev
```

Call the URL that `neon dev` prints, which defaults to `http://localhost:8787/`. For example, send an event:

```bash
curl -s http://localhost:8787/send-event \
  -H "authorization: Bearer $LOOPS_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "email": "grace@example.com",
    "eventName": "trialEnding",
    "eventProperties": { "daysLeft": 3 }
  }'
```

```json
{ "sent": true }
```

Managed Better Auth only calls a public HTTPS URL, so test `/auth-webhook` after you deploy.

## Routes

<Operations>

| Method | Path | Auth | Body | Result |
| --- | --- | --- | --- | --- |
| `POST` | `/auth-webhook` | Managed Better Auth signature | A Managed Better Auth webhook event | `200` once Loops accepts the email, contact, or event |
| `POST` | `/send-event` | Bearer `LOOPS_FUNCTION_TOKEN` | `{ email?, userId?, eventName, eventProperties?, contactProperties? }` | `200` with `{ "sent": true }`, or an error |

</Operations>

`/auth-webhook` sends each `send.otp` and `send.magic_link` event as the matching Loops transactional email, with the code or link as its data variable. On `user.created`, it creates or updates the Loops contact with the Managed Better Auth user ID as `userId` and adds the first and last name when the user has one, leaving the contact's other fields as they are. On `organization.invitation.accepted`, it sends a `joinedOrganization` event with `organizationName` and `role`, and it returns `200` for any other event.

`/send-event` needs `email`, `userId`, or both, and its event and contact properties are flat objects of strings, numbers, and booleans. The route passes an `Idempotency-Key` header through to Loops, which rejects a key used in the last 24 hours even when that earlier request failed.

## Deploy

```bash
neon deploy --env .env.local
neon functions get loopsemail
```

`neon functions get` prints the function's public URL. Point the branch's Managed Better Auth webhook at it:

```bash
neon neon-auth config webhook update --enabled \
  --url https://<function-url>/auth-webhook \
  --enabled-events send.otp send.magic_link user.created
```

> Replace `<function-url>` with the URL from `neon functions get loopsemail`.

If you use the [Organization plugin](https://neon.com/docs/auth/guides/plugins/organization), also select `organization.invitation.accepted` in the [Neon Console](https://console.neon.tech) under **Settings** > **Better Auth** > **Webhooks**. The CLI doesn't accept that event yet and replaces the whole event list on each run, so running the command again removes `organization.invitation.accepted`.

Managed Better Auth doesn't send test events, so sign in to your app with an email code or magic link to try it. The send appears on the Loops [Transactional](https://app.loops.so/transactional) page, and new users appear in your Loops audience.

## Errors

- `400`: a webhook without a code or link, or a `/send-event` body that is not a JSON object or has a missing or invalid field
- `401`: a webhook with a missing or invalid signature or one older than 5 minutes, or a missing or wrong function token
- `405`: a method other than `POST`
- `409`: an `Idempotency-Key` used in the last 24 hours
- `413`: a `/send-event` body over 100 KB
- `422`: no transactional ID set for the email type, an SMS code, or Loops rejected the event
- `502`: Loops or the Managed Better Auth signing keys could not be reached, or Loops failed to send
- `503`: `LOOPS_API_KEY` or `NEON_AUTH_JWKS_URL` is unset, or `LOOPS_FUNCTION_TOKEN` is unset or shorter than 32 characters

`/auth-webhook` logs every error as `[loops-email] <status>: <reason>`. When it fails a `send.magic_link` event, the user's request fails with `WEBHOOK_DELIVERY_FAILED`. When it fails an email code from `send.otp`, Managed Better Auth still tells your app the code was sent, so the user waits for an email that never arrives and the function logs are the only place the failure shows up. Set a transactional ID for every email type your app sends.

Neon retries a webhook after a `5xx` but not after a `4xx`. The function skips an event it already handled, but a retry that reaches another instance can send the same code twice.

## Notes

- Neon Functions strip `X-Neon-*` request headers, so Managed Better Auth also sends its signature headers as `Neon-Better-Auth-*`, and the function reads either name.
- Each branch has one webhook URL, so don't subscribe it to `user.before_create`, which expects an allow or deny response that this function doesn't return.
- Loops doesn't send SMS, so this function returns `422` for `send.otp` events with `delivery_preference: "sms"` instead of emailing the code. The [Phone Number plugin](https://neon.com/docs/auth/guides/plugins/phone-number) needs a `send.otp` webhook that sends SMS, so it can't share the branch's webhook with this function.
- Custom SMTP in Managed Better Auth doesn't work with Loops, because Loops SMTP expects a JSON payload with a `transactionalId` and Managed Better Auth sends its own email body.
- To store Loops delivery, bounce, and unsubscribe events in Postgres, see [Store Loops webhook events in Postgres](https://neon.com/docs/guides/loops-webhooks).
