# Support triage with Jev

A Neon Function that triages support messages with [Jev 1.14](https://neon.com/docs/ai-gateway/models/typesafeai-jev-1-14-0), TypeSafe AI's System One decision model on [Neon AI Gateway](https://neon.com/docs/ai-gateway/overview).

Jev does not generate text. It answers typed questions about an input with a choice, a score, or a probability. That makes it fast and cheap, and its answers come back as numbers you can put a threshold on. One call asks five questions about a message:

| Answer | Question type | What it tells you |
| --- | --- | --- |
| `topic` | `choice` | Which team should handle it: `billing`, `bug`, `howto`, `account`, `feature`, or `other`, with a probability for each. |
| `urgency` | `score` | Where it falls on a four-level rubric, from "Can wait a few days" (0) to "Production outage" (3). |
| `frustrated` | `boolean` | Probability that the customer is frustrated or angry. |
| `churnRisk` | `boolean` | Probability that the customer is threatening to cancel or switch. |
| `spam` | `boolean` | Probability that it is spam or a sales pitch. |

The function turns those answers into a `route`: `drop` for likely spam, `escalate` for urgent messages or churn risk, and `queue` for everything else.

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new jev-triage
```

The CLI writes `functions/jevtriage/index.ts` and declares the function in `neon.ts`.

Enable AI Gateway on the linked branch:

```bash
neon config add ai-gateway
```

You can also set `aiGateway: true` in `neon.ts`. AI Gateway requires a paid Neon plan with prepaid credits and a project in a supported region. See the [AI Gateway quickstart](https://neon.com/docs/ai-gateway/get-started).

Function URLs are public, so every request needs a bearer token. Generate one and add it to `.env.local`:

```bash
echo "JEV_TRIAGE_TOKEN=$(openssl rand -hex 32)" >> .env.local
```

<EnvironmentVariables>

- `JEV_TRIAGE_TOKEN`: A random token of at least 32 characters, for example from `openssl rand -hex 32`, that callers send as `Authorization: Bearer <token>`. Neon Function URLs are public, so the function requires it.

</EnvironmentVariables>

Deploy once so Neon provisions the gateway and pulls `NEON_AI_GATEWAY_BASE_URL` and `NEON_AI_GATEWAY_TOKEN` into `.env.local`:

```bash
neon deploy --env .env.local
```

## Run locally

```bash
neon dev
```

Call the URL that `neon dev` prints. The examples below use `$URL` for that URL and `$TOKEN` for your `JEV_TRIAGE_TOKEN`.

```bash
curl "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Production is down",
    "message": "Our production database has been unreachable for 40 minutes and every checkout is failing. This is the second time this month. If this is not fixed today we are moving to another provider."
  }'
```

Example response:

```json
{
  "route": "escalate",
  "topic": {
    "choice": "bug",
    "probabilities": { "billing": 0, "bug": 0.99, "howto": 0, "account": 0, "feature": 0, "other": 0.01 }
  },
  "urgency": { "score": 3, "level": "Production outage, data loss, or a security incident" },
  "frustrated": 0.93,
  "churnRisk": 0.97,
  "spam": 0.03,
  "model": "typesafeai-jev-1-14-0",
  "usage": { "inputTokens": 575, "outputTokens": 126, "totalTokens": 701 }
}
```

A how-to question such as "How do I invite a teammate to my project?" comes back as `route: "queue"` with `topic.choice: "howto"`, and an SEO sales pitch as `route: "drop"` with `spam: 0.98`.

`urgency.score` is the probability-weighted mean over the rubric, so it can fall between levels. `urgency.level` is the single most likely level.

## Request format

Send `POST /` with a JSON body:

| Field | Required | Rule |
| --- | --- | --- |
| `message` | yes | The message text, 1 to 20,000 characters. |
| `subject` | no | A subject line, up to 500 characters. |

## Errors

| Status | Meaning |
| --- | --- |
| `400` | The body is not JSON or fails validation. |
| `401` | The bearer token is missing or wrong. |
| `405` | The method is not `POST`. |
| `422` | Jev declined to answer one of the questions. |
| `429` | AI Gateway rate limit or daily spend cap reached. |
| `502` | The decision request failed, or AI Gateway rejected the branch credentials. |
| `503` | `JEV_TRIAGE_TOKEN` is unset or shorter than 32 characters, or AI Gateway is not enabled. |

## Customize

- **Questions:** edit `QUESTIONS` in `index.ts`. A `choice` question takes a map of labels to descriptions (`null` leaves a label undescribed), a `score` question takes an ordered rubric of at least two levels, and a `boolean` question takes instructions. All questions are answered in one call against the same state.
- **Routing:** `SPAM_THRESHOLD`, `CHURN_THRESHOLD`, and `ESCALATE_URGENCY` decide the `route`. Tune them on your own messages instead of rewording a prompt.
- **Model:** `MODEL` is `typesafeai-jev-1-14-0`. `GET $NEON_AI_GATEWAY_BASE_URL/v1/models` lists the decision models your branch serves as the ones with `dialects: ["systemone"]`.
- **Auth:** the shared token suits webhooks and backend callers, such as a help desk that forwards new tickets. Don't ship it in a browser bundle.
