# AI visibility scan with Notra

Find out whether AI assistants recommend your product. This Neon Function asks GPT, Claude, and Gemini the questions your buyers ask, through [Neon AI Gateway](https://neon.com/docs/ai-gateway/overview), and reads every answer: is your brand named, at what position, next to which competitors, and in what tone. Each scan is stored in Postgres, and a [Function Trigger](https://neon.com/docs/compute/functions/triggers/overview) can rerun it every day so you can watch the numbers move.

Built by [Notra](https://www.usenotra.com), the generative engine optimization (GEO) platform.

<Operations>

| Route | What it does |
| --- | --- |
| `POST /scan` | `{ brand, domain?, competitors?, prompts?, models?, track? }` asks every model every prompt and returns visibility, average position, share of voice, sentiment, and competitors you did not list. |
| `POST /prompts` | `{ brand, domain?, count? }` writes buyer prompts, grounded in your homepage when you pass `domain`. `/scan` does this when you leave out `prompts`. |
| `GET /scans/:id` | A stored scan with every full answer. |
| `GET /report?brand=&days=` | Daily visibility and average position per model, and the latest scan's summary. |
| `GET /tracked` | Brands the schedule trigger rescans. |
| `DELETE /tracked/:brand` | Stop rescanning a brand. |
| `POST /cron` | Rescans every tracked brand. Only a schedule trigger can call it. |

</Operations>

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new notra-geo-scan
```

The CLI writes `functions/notrageoscan/index.ts`, declares the function in `neon.ts`, and adds `GEO_SCAN_TOKEN` to `.env.example`.

Enable AI Gateway on the linked branch:

```bash
neon config add ai-gateway
```

AI Gateway needs prepaid credits and a project in a supported region. See the [AI Gateway quickstart](https://neon.com/docs/ai-gateway/get-started). A default scan makes 31 model calls (1 to write prompts, then 5 prompts × 3 models, each answered and then read), which costs a few cents.

Function URLs are public, so every route except `/cron` needs a bearer token. Generate one and add it to `.env.local`, keeping the Neon values already there:

```bash
export GEO_SCAN_TOKEN=$(openssl rand -hex 32)
echo "GEO_SCAN_TOKEN=$GEO_SCAN_TOKEN" >> .env.local
```

<EnvironmentVariables>

- `GEO_SCAN_TOKEN`: A random token of at least 32 characters that callers send as `Authorization: Bearer <token>`.

</EnvironmentVariables>

The function creates its three tables (`geo_scans`, `geo_checks`, and `geo_tracked`) on first use.

## Run a scan

```bash
neon dev
```

Call the URL that `neon dev` prints (the default is `http://localhost:8787/`). Give it a brand, its domain, and the competitors you care about:

```bash
curl -s http://localhost:8787/scan \
  -H "authorization: Bearer $GEO_SCAN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"brand":"Neon","domain":"neon.com","competitors":["Supabase","PlanetScale"]}'
```

The function reads your homepage and writes five questions a buyer in your category would ask, without naming your brand. It asks each one to `gpt-5-mini`, `claude-haiku-5-5`, and `gemini-3-flash` in parallel, and a second model lists the products each answer offers. The function then checks those against the answer text itself: a brand counts as mentioned only if the answer names it, and positions follow the order in which the answer presents the products. A scan takes one to two minutes. This is a real response, shortened:

```json
{
  "id": "82871f6b-e7fa-4b06-ae39-a4b0c6c9ec02",
  "brand": "Neon",
  "prompts": [
    "best managed Postgres for a serverless web app with unpredictable traffic",
    "which backend is best for bursty workloads to avoid paying for unused capacity",
    "alternatives to Firebase that give Postgres, auth, file storage, and serverless functions",
    "how to choose between a serverless database and provisioned instances for a new startup",
    "which database/stack makes it easy to give each dev or preview build its own isolated copy of the backend"
  ],
  "visibility": 0.8,
  "averagePosition": 2.83,
  "shareOfVoice": { "Neon": 0.41, "Supabase": 0.34, "PlanetScale": 0.24 },
  "byModel": {
    "gpt-5-mini": { "answers": 5, "mentions": 2, "visibility": 0.4, "averagePosition": 1 },
    "claude-haiku-5-5": { "answers": 5, "mentions": 5, "visibility": 1, "averagePosition": 3.6 },
    "gemini-3-flash": { "answers": 5, "mentions": 5, "visibility": 1, "averagePosition": 2.8 }
  },
  "sentiment": { "positive": 9, "neutral": 3, "negative": 0 },
  "discoveredCompetitors": [
    { "name": "Vercel", "mentions": 7 },
    { "name": "Aurora Serverless v2", "mentions": 4 },
    { "name": "Render", "mentions": 4 },
    { "name": "Railway", "mentions": 4 }
  ],
  "checks": [
    {
      "prompt": "best managed Postgres for a serverless web app with unpredictable traffic",
      "model": "gemini-3-flash",
      "mentioned": true,
      "position": 1,
      "competitors": ["Supabase"],
      "sentiment": "positive",
      "snippet": "…PostgreSQL providers ranked by their fitness for serverless workloads. --- 1. Neon (The Gold Standard) Neon is currently the industry leader for \"true\" serverless Postgres. It separates storage from compute, which allows for unique…"
    }
  ],
  "checkCount": 15,
  "failedChecks": 0
}
```

- `visibility` is the share of answers that name your brand.
- `averagePosition` is where your brand lands in the answers that name it, where 1 is the first product the answer offers.
- `shareOfVoice` splits the mentions among your brand and the competitors you listed.
- `discoveredCompetitors` are the products the models offer that you did not list.
- Each check has a `snippet` of the answer around the first mention. `GET /scans/:id` returns the full answers.

To scan your own questions or other models, pass `prompts` (up to 10) and `models` (up to 5, any text model in the [model catalog](https://neon.com/docs/ai-gateway/models)). Pass `aliases` when your brand goes by more than one name.

## Track it every day

Add `"track": true` to a scan to save its brand, prompts, and models. Then add a schedule trigger next to `functions` in `neon.ts`:

```typescript
export default defineConfig({
  functions: {
    notrageoscan: {
      // …as scaffolded
    },
  },
  triggers: {
    "daily-geo-scan": {
      type: "schedule",
      function: "notrageoscan",
      cron: "0 7 * * *",
      functionPath: "/cron",
    },
  },
});
```

Every morning at 07:00 UTC the trigger rescans each tracked brand with the same prompts, so the results stay comparable. Each scheduled run scans a brand at most once, even when Neon delivers it again:

- If every model call for a brand fails, for example because AI Gateway is out of credits, `/cron` still scans the other brands, then answers `503` with `Retry-After`, and Neon delivers the trigger again later.
- A function must start responding within 15 minutes, so after 8 minutes `/cron` answers `503` with `Retry-After: 1` and leaves the remaining brands to the next delivery.
- A redelivery skips the brands that an earlier delivery already saved.

Read the trend:

```bash
curl -s "http://localhost:8787/report?brand=Neon&days=30" \
  -H "authorization: Bearer $GEO_SCAN_TOKEN"
```

Every check is a row in `geo_checks`, so you can also ask your own questions in SQL. For example, the answers that recommend Supabase but not Neon, and what they put first:

```sql
SELECT c.model, c.prompt, c.brands[1:3] AS top_products
FROM geo_checks c
JOIN geo_scans s ON s.id = c.scan_id
WHERE s.brand = 'Neon' AND NOT c.mentioned AND 'Supabase' = ANY (c.competitors);
```

## Deploy

```bash
neon deploy --env .env.local
neon functions get notrageoscan
```

`neon functions get` prints the public URL. Call it the same way as locally, with the bearer token. Triggers only fire against the deployed function.

## Go further with Notra

This function asks the models directly, without web search. It shows what each model has learned about your category, which is the baseline that live answers build on. The ChatGPT, Perplexity, and Gemini apps that people actually use also search the web, cite sources, and personalize answers, so their results can differ.

[Notra](https://www.usenotra.com) runs the same scan in those apps: it tracks visibility and cited sources across ChatGPT, Perplexity, Gemini, Google AI Mode, Claude, and Copilot in several languages, shows which pages AI crawlers and assistants visit, and drafts the content that closes the gaps. Its [API](https://www.usenotra.com/docs/api/getting-started) and [webhooks](https://www.usenotra.com/docs/api/webhooks/overview) (`geo.scan.completed`, `geo.alert.triggered`) fit next to this function.

## Errors

| Status | Meaning |
| --- | --- |
| `400` | The body is not JSON or fails validation, or `/report` has no `brand`. |
| `401` | The bearer token is missing or wrong, or `/cron` was not called by a trigger. |
| `404` | The route or scan does not exist, or the brand is not tracked. |
| `429` | AI Gateway rate limit or daily spend limit reached on every call. |
| `502` | Every model call failed, for example because a model ID is not in the catalog, or the model wrote no usable prompts. A scan where only some calls fail still returns `201`, with `error` set on those checks and counted in `failedChecks`. |
| `503` | `GEO_SCAN_TOKEN` is unset or shorter than 32 characters, or AI Gateway is not enabled. `/cron` also answers `503` with `Retry-After` when a tracked brand failed or the run needs another delivery to finish. |
