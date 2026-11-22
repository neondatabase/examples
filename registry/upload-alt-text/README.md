# Alt text for uploaded images

This Neon Function writes alt text for every image that lands in a Neon Object Storage bucket. A `storage_object_created` Function Trigger calls it after each upload, so nothing in your upload path has to change. The function reads the image, asks a vision model on [Neon AI Gateway](https://neon.com/docs/ai-gateway/overview) for alt text, search tags, and any visible text, and saves the result in Postgres with [Drizzle](https://orm.drizzle.team). Your app can then read the description and search images by tag with an ordinary database query.

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new upload-alt-text
```

The CLI writes `functions/uploadalttext/index.ts`, declares the function in `neon.ts`, and installs the template's dependencies.

Enable AI Gateway and declare the bucket that users upload to:

```bash
neon config add ai-gateway
neon config add bucket uploads
```

Then add the trigger to the `neon.ts` that `neon functions new` created:

```ts
triggers: {
  "describe-uploads": {
    type: "storage_object_created",
    function: "uploadalttext",
    bucket: "uploads",
    functionPath: "/object",
  },
},
```

Set `prefix`, for example `prefix: "images/"`, to limit the trigger to one folder in the bucket. Trigger names must be unique on the branch.

Functions, Object Storage, and AI Gateway are available in `aws-us-east-2`, `aws-us-east-1`, `aws-eu-central-1`, and `aws-ap-southeast-1`. AI Gateway needs prepaid credits. See the [AI Gateway quickstart](https://neon.com/docs/ai-gateway/get-started).

## Deploy

```bash
neon deploy
```

The deploy creates the bucket, deploys the function, and then creates the trigger. It also pulls `DATABASE_URL`, the `AWS_*` storage variables, and the `NEON_AI_GATEWAY_*` variables into `.env.local`.

## Create the table

The module exports its Drizzle schema, so `drizzle-kit push` can create the `image_descriptions` table on the linked branch. Install drizzle-kit and add this `drizzle.config.ts` next to `neon.ts`:

```bash
npm install -D drizzle-kit
```

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./functions/uploadalttext/index.ts",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED! },
});
```

drizzle-kit loads only `.env`, so pass `.env.local` to it with Node's `--env-file` flag:

```bash
node --env-file=.env.local node_modules/drizzle-kit/bin.cjs push
```

Run the push again on any new branch that doesn't inherit the table from its parent.

## Try it

Upload an image to the bucket:

```bash
neon buckets object put uploads/photo.jpg --file ./photo.jpg
```

The trigger calls the function a few seconds later. Each call shows up in the function logs:

```bash
neon logs query --source function --since 10m
```

The function upserts one row per object, keyed by bucket and key:

| Column | Contents |
| --- | --- |
| `alt_text` | One sentence of alt text, at most about 125 characters. |
| `tags` | Up to 10 lowercase search tags, with a GIN index. |
| `visible_text` | Text that appears in the image, transcribed exactly. |
| `etag`, `content_type`, `size_bytes` | The version of the object that the function described. |
| `model`, `described_at` | The model that wrote the description, and when. |

Import the table from the function module to query it with Drizzle in your app. This query finds every image tagged `cat`:

```ts
import { arrayContains } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { imageDescriptions } from "./functions/uploadalttext/index.ts";

const db = drizzle(process.env.DATABASE_URL!);
const cats = await db
  .select({ key: imageDescriptions.key, altText: imageDescriptions.altText })
  .from(imageDescriptions)
  .where(arrayContains(imageDescriptions.tags, ["cat"]));
```

The [presigned-uploads](https://neon.com/functions/templates/presigned-uploads) template writes browser uploads to the same `uploads` bucket, so the two templates work together without changes.

## Run locally

```bash
neon dev
```

Uploads to the bucket fire the deployed trigger, not `neon dev`. To run a delivery against the local function, upload an image and then post the delivery that Neon would send. `neon dev` forwards the `x-neon-trigger-invocation-id` header that the deployed proxy strips from outside callers:

```bash
neon buckets object put uploads/photo.jpg --file ./photo.jpg

curl -X POST http://localhost:8787/object \
  -H 'content-type: application/json' \
  -H 'x-neon-trigger-invocation-id: local-dev' \
  -d '{"version":1,"invocation_id":"local-dev","trigger":{"type":"storage_object_created","id":"trigger-local","name":"describe-uploads"},"data":{"bucket_name":"uploads","object_key":"photo.jpg"}}'
```

The response looks like this:

```json
{
  "status": "described",
  "bucket": "uploads",
  "key": "photo.jpg",
  "altText": "Red outline icon of three stacked, layered shapes on a white background.",
  "tags": ["red icon", "stacked layers", "layers", "outline", "abstract symbol", "white background"],
  "visibleText": [],
  "model": "gpt-6-luna",
  "describedAt": "2026-11-22T20:03:57.022Z"
}
```

If the deployed trigger described the object first, the local call returns `"status": "skipped"` with the reason `This version of the object is already described.`

## Routes

<Operations>

| Route | Caller | Purpose |
| --- | --- | --- |
| `GET /` | Anyone | Returns the route list and the table name. |
| `POST /object` | Neon trigger only | Describes the new object and upserts it into `image_descriptions`. Requests without a matching `x-neon-trigger-invocation-id` header get `401`. |

</Operations>

`POST /object` returns `200` with `"status": "skipped"` and a reason when the object is not a JPEG, PNG, GIF, or WebP image, is empty, is larger than 10 MB, was deleted before the function read it, or has the same ETag as the row already stored. When the content type of an upload is missing or generic, the function falls back to the file extension. A failed model or database call returns `502` and logs the error.

## Notes

- Overwriting an object with new content changes its ETag, so the next delivery describes it again and replaces the row. Deleting an object does not remove its row, because the trigger only fires on create.
- The template uses `gpt-6-luna`, which accepts images and costs $0.10 per million input tokens. Change `MODEL` in `functions/uploadalttext/index.ts` to use another vision model from the [AI Gateway catalog](https://neon.com/docs/ai-gateway/overview#available-models).
- Edit `descriptionSchema` to ask the model for other fields, such as a dominant color or a safety label. Add a matching column to `imageDescriptions` and run `drizzle-kit push` again.
