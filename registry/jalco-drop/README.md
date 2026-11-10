# Self-hosted file transfer with jalco-drop

[jalco-drop](https://drop.justinlevine.me) turns a file, a folder, a paste or a screen recording into a link that opens properly: code highlighted, markdown rendered, CSV as a table, folders as a page with a file tree, and [Scrawl](https://scrawl.kitlangton.com) captures with their transcript. Links can have a password and an expiry, bots upload with their own named tokens, and agents read any link as JSON. This template runs it as one Neon Function, storing drops in a Neon Object Storage bucket.

## Scaffold it

```bash
npm install -g neon@latest
neon login
neon link
neon functions new jalco-drop
```

The CLI writes `functions/jalcodrop/index.ts`, declares the function in `neon.ts`, and installs `jalco-drop`. That file is yours: it configures the app, adds a `/health` route, and teaches it a new file format. See [Make it yours](#make-it-yours).

Add the bucket and the hourly trigger that deletes expired drops to the `neon.ts` that `neon functions new` created:

```ts
buckets: {
  drops: {},
},
triggers: {
  cleanup: {
    type: "schedule",
    function: "jalcodrop",
    cron: "0 * * * *",
    functionPath: "/__scheduled",
  },
},
```

Object Storage is available in `aws-us-east-2`, `aws-us-east-1`, `aws-eu-central-1`, and `aws-ap-southeast-1`. See [Object Storage](https://neon.com/docs/storage/overview).

Generate an admin token and add it to `.env.local`:

```bash
echo "ADMIN_TOKEN=$(openssl rand -base64 32)" >> .env.local
```

<EnvironmentVariables>

- `ADMIN_TOKEN`: A long random string that signs in to `/admin` and the upload API, and signs session and unlock cookies. Rotating it signs everyone out.
- `OWNER_NAME`, `SITE_NAME`, `ACCENT_COLOR`, `CODE_THEME`, `HOME_URL` (optional): starting values for the site's settings. You can change all of them later under Settings in `/admin` without redeploying.
- `DROPS_BUCKET` (optional): the bucket drops are stored in. Defaults to `drops`.
- `RATE_LIMIT` (optional): set to `off` to disable the per-IP limit of 60 requests a minute.

</EnvironmentVariables>

Deploy once so Neon creates the bucket and pulls `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, and `AWS_REGION` into `.env.local`:

```bash
neon deploy --env .env.local
```

## Run locally

```bash
neon dev
```

`neon dev` serves jalco-drop at `http://localhost:8787/`. Sign in at `/admin` with your admin token, or upload from a terminal:

```bash
curl -X POST "http://localhost:8787/api/items?name=notes.md&expires=7d" \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: text/markdown" \
  --data-binary @notes.md
```

Example response (`201`):

```json
{ "slug": "k3x9q2m8vt", "url": "http://localhost:8787/k3x9q2m8vt" }
```

Add `?format=json` to any drop link to read it as JSON.

## Routes

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | None | Storage check and uptime, defined in your `index.ts`. `503` when the bucket can't be reached. |
| `GET /<slug>` | Password, if the drop has one | Opens a drop in the browser. Add `?format=json` for its files and raw URLs. |
| `GET /admin` | Admin token | Drops, named tokens and site settings (name, accent colour, code theme). |
| `POST /api/items` | Bearer token with upload | Uploads the request body. Query: `name`, `slug`, `expires`; header `X-Drop-Password`. |
| `GET /api/items` | Bearer token with list | Lists drops. |
| `DELETE /api/items/<slug>` | Bearer token with delete | Deletes a drop. |
| `POST /api/tokens` | Admin token | Creates a named token for a bot or agent. |
| `POST /__scheduled` | Neon trigger only | Deletes expired drops. Requests without Neon's `X-Neon-Trigger-Invocation-Id` header get `401`. |

`/` redirects away, nothing is listed without a token, and each IP gets 60 requests a minute.

## Make it yours

`functions/jalcodrop/index.ts` is plain code you own. `createDrop()` from `jalco-drop/neon` takes the settings, and returns `fetch` (the whole app) and `health()` (a storage check). Everything else in the file is an example to change:

- **Settings**: `site`, `bucket` and `rateLimit` are read from the environment here. Hard-code them, or read them from anywhere else.
- **Routes**: the `fetch` export runs before jalco-drop. `/health` is one route; add your own the same way, or wrap `drop.fetch` to add auth or logging.
- **File formats**: `logs` makes `.log` files open with errors and warnings tinted. A format has an `id`, a `test` on the file name, and a `render` that returns HTML through `rawHtml()`. Escape anything from the file before you put it in the markup, as `escape()` does. Formats you add win over the built-in ones, and every format keeps a Source view at `?view=source`.

## Deploy

```bash
neon deploy --env .env.local
neon functions get jalcodrop
```

`neon functions get` prints the public URL. To serve it from your own hostname, add `customDomains: ["drop.example.com"]` to the function in `neon.ts`; see [Custom domains](https://neon.com/docs/compute/functions/custom-domains).

## Notes

- Neon caps a request body at 10 MB, so that is the largest single drop.
- Neon Functions have no headless browser, so link previews use a summary card instead of a rendered image.
- The CLI (`curl -fsSL <your-url>/cli -o jalco-drop && chmod +x jalco-drop`) uploads folders, Scrawl captures and Superwhisper notes, and `npx skills add jal-co/jalco-drop` gives your coding agent the same abilities. See the [docs](https://drop.justinlevine.me).
