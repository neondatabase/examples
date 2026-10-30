# Image insights

Summaries and categories for uploaded images. Upload a PNG or JPEG, and a Neon Storage trigger has a Function ask an AI Gateway vision model for a one-sentence summary and up to five categories, stored in Postgres.

## What gets deployed

- A Neon Function, `insights`, serving the API and receiving the trigger.
- A private Storage bucket, `images`.
- An object-created trigger, `image-uploaded`, on `uploads/`, that POSTs to `/object-created`.
- AI Gateway access for the function.
- An `insights` schema with an `images` table, created by `migrations/`.

`neon deploy --env .env.local` deploys all of it, then the `deploy.after` hook in `neon.ts` applies any new migrations and checks the function can reach the bucket and the model.

## Deploy it

One command scaffolds it, creates a new Neon project, generates its key into `.env.local`, and deploys it:

```sh
neon bootstrap my-image-insights --template image-insights --deploy
```

`--deploy` is staging-only for now. To deploy it by hand:

```sh
npm install
neon link --project-name my-image-insights
echo "INSIGHTS_API_KEY=$(openssl rand -hex 32)" > .env.local
npm run deploy
```

## API

| Request | Body | Result |
| --- | --- | --- |
| `GET /health` | | 200 when the database and schema are ready |
| `POST /v1/images` | Raw PNG or JPEG, up to 5 MiB | 202 with `sha256` |
| `GET /v1/images/:sha256` | | Status, and `result.summary` / `result.categories` when done |
| `POST /v1/images/:sha256/reprocess` | | Retry a `retryable` image |
| `GET /v1/check` | | Bucket and model reachable |
| `POST /object-created` | Trigger delivery | Only Neon's trigger can call it |

`/v1` requests need `Authorization: Bearer $INSIGHTS_API_KEY`. The model sees the image only; it isn't asked to identify people.
