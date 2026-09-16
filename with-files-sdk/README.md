<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon, the Files SDK, and storage triggers

A [Files SDK](https://files-sdk.dev) script uploads local PNGs into [Neon object storage](https://neon.com/docs/storage/object-storage). A [Hono](https://hono.dev) Function on [Neon Functions](https://neon.com/docs/compute/functions/overview) indexes each object in [Lakebase Postgres](https://neon.com/docs/postgres/overview) when a `storage_object_created` [Function Trigger](https://neon.com/docs/cli/triggers) in `neon.ts` POSTs to `/object`.

The Function does not upload. The script does. The trigger is how the Function learns about objects it did not write.

`GET /files` is public. `POST /object` calls [`parseTriggerDelivery`](https://www.npmjs.com/package/@neon/functions) from `@neon/functions/hono`, which returns 401 unless `x-neon-trigger-invocation-id` matches the JSON body's `invocation_id`, and 400 on an invalid payload.

## Project structure

```
with-files-sdk/
├── neon.ts             # Bucket + Function + storage trigger policy (defineConfig)
├── drizzle.config.ts   # Drizzle Kit config (schema location + DB credentials)
├── tsconfig.json
├── .env.example        # Required environment variables
├── assets/             # Local files uploaded by the script
│   ├── neon-logo.png
│   └── neon-logomark.png
├── src/
│   ├── index.ts        # Hono Function: GET /files and POST /object
│   ├── upload.ts       # Files SDK script: upload each asset, print a URL, list the bucket
│   ├── env.ts          # DATABASE_URL helper
│   └── db/
│       ├── client.ts   # pg pool + Drizzle
│       └── schema.ts   # objects table
└── package.json
```

## Clone the repository

```bash
npx degit neondatabase/examples/with-files-sdk ./with-files-sdk
cd with-files-sdk
```

## Install and authenticate the Neon CLI

```bash
npm i -g neon
neon login
```

Use Neon CLI 4.19 or newer so `neon.ts` can declare `storage_object_created` triggers.

## Install dependencies

```bash
npm install
```

## Link your Neon project

> Object storage is a preview feature available only on **new** projects in the **`us-east-2`** region. Create one there before linking. Functions and triggers need `aws-us-east-2` or `aws-eu-central-1`.

```bash
neon link
```

If you let your agent drive this, add `--agent` to skip interactive mode.

`neon link` pulls your branch-scoped environment variables — including `DATABASE_URL` and the `AWS_*` object-storage credentials — into `.env.local`.

## Apply the schema

Push the Drizzle schema to your Neon database:

```bash
npm run db:push
```

## Provision the bucket, Function, and trigger

`neon deploy --env .env.local` applies `neon.ts`. That creates the `assets` bucket, deploys the Function, and creates the `on-upload` storage trigger when Function Triggers is available on the project.

```bash
npm run deploy
```

```ts
preview: {
  buckets: {
    assets: { access: "public_read" },
  },
  functions: {
    ingest: {
      name: "Object ingest",
      source: "src/index.ts",
      dev: { port: 8787 },
      triggers: [
        {
          type: "storage_object_created",
          name: "on-upload",
          bucketName: "assets",
          prefix: "logos/",
          functionPath: "/object",
        },
      ],
    },
  },
}
```

List triggers with `neon triggers list`.

If `neon deploy` returns 404 `function triggers not available for this project`, deploy the Function without applying the trigger:

```bash
neon functions deploy ingest --src src/index.ts
```

## Run the upload script

```bash
npm run upload
```

You'll see each asset uploaded with a presigned view URL, followed by a listing of the objects now in your bucket. Open a presigned URL in the browser to confirm the upload.

## Check the index

```bash
neon functions get ingest
```

```bash
curl https://<your-branch>-ingest.compute.<region>.aws.neon.tech/files
```

After the uploads, `/files` should list `logos/neon-logo.png` and `logos/neon-logomark.png`.

A `POST /object` missing `x-neon-trigger-invocation-id`, or with a body whose `invocation_id` does not match that header, returns `401`. Invalid JSON or payload returns `400`.

## Run locally

```bash
neon dev
```

Then in another shell:

```bash
curl http://localhost:8787/files

curl -i -X POST http://localhost:8787/object \
  -H 'content-type: application/json' \
  -d '{}'

curl -X POST http://localhost:8787/object \
  -H 'content-type: application/json' \
  -H 'x-neon-trigger-invocation-id: local-dev' \
  -d '{
    "version": 1,
    "invocation_id": "local-dev",
    "trigger": {
      "type": "storage_object_created",
      "id": "trigger-local",
      "name": "on-upload"
    },
    "data": {
      "bucket_name": "assets",
      "object_key": "logos/neon-logo.png"
    }
  }'

curl http://localhost:8787/files
```

`neon dev` forwards `x-neon-trigger-invocation-id` so you can simulate a delivery locally. A public POST to the deployed Function that includes that header still returns 401.

## Explore the bucket from the CLI

```bash
neon bucket object list assets
neon bucket object get assets logos/neon-logo.png ./neon-logo.png
```
