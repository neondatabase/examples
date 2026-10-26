## Neon

By default, when using the Neon CLI, always use the project `[PROJECT NAME]` (id: `[PROJECT ID]`).

## This project

Image summaries and categories, from a Storage object-created trigger and AI Gateway vision. The sections below cover calling it and changing it.

- `src/` is the function: `app.ts` routes requests, `image.ts` checks image bytes, `services.ts` calls Storage and AI Gateway, `store.ts` holds the results SQL.
- `migrations/` holds the schema. Add new files; never edit applied ones.
- `neon.ts` declares the bucket, the trigger, AI Gateway and the function, and runs migrations plus a smoke test after every `neon deploy`.
- Deploy with `npm run deploy` (`neon deploy --env .env.local`). `INSIGHTS_API_KEY` and `IMAGE_MODEL` live in `.env.local`.

## Neon image insights

This project is a Neon Function (`insights`), a private Storage bucket (`images`), and an object-created trigger (`image-uploaded`) on `uploads/`. When a PNG or JPEG lands in `uploads/<sha256>.png|jpg`, the trigger calls `/object-created`, the function asks an AI Gateway vision model for a one-sentence summary and up to five categories, and stores them in `insights.images`.

Your backend calls the `/v1` API with `Authorization: Bearer $INSIGHTS_API_KEY` (in `.env.local`; never commit it). Find the URL with `neon functions get insights`.

- `POST /v1/images` with the raw image as the body and `Content-Type: image/png` or `image/jpeg` (5 MiB max). Returns 202 with the image's `sha256`.
- `GET /v1/images/<sha256>` returns `status` (`processing`, `completed`, `retryable`, `rejected`, `failed`) and, once completed, `result: { summary, categories }`.
- `POST /v1/images/<sha256>/reprocess` retries a `retryable` image. Trigger retries are off by default, so a failed attempt is not redelivered on its own.
- `GET /v1/check` confirms the bucket and model are reachable without paying for inference.

Object keys are content-addressed, so the same image is processed once. Other keys under `uploads/` are ignored.

### Change the prompt or model

The prompt is in `src/services.ts` (`summarize`). Set `IMAGE_MODEL` in `.env.local`, then `neon deploy --env .env.local`. Schema changes go in a new `migrations/` file; `neon deploy` applies it.
