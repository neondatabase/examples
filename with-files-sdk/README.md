<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and the Files SDK

A minimal script that uploads local files into [Neon](https://neon.com) object storage using the [Files SDK](https://files-sdk.dev) and its `neon` adapter — one small, unified API over an S3-compatible, branchable bucket.

Neon object storage branches with your database: every branch gets its own isolated, copy-on-write storage state. The bucket is declared in `neon.ts` and provisioned by `neon deploy`, which also injects the S3 credentials — so there are no secrets to copy around.

## Project structure

```
with-files-sdk/
├── neon.ts             # Neon policy: declares the object-storage bucket
├── tsconfig.json
├── .env.example        # S3 credentials injected by `neon deploy` / `neon env pull`
├── assets/             # The local files uploaded by the script
│   ├── neon-logo.png
│   └── neon-logomark.png
├── src/
│   └── index.ts        # The script: upload each asset, print a presigned URL, list the bucket
└── package.json
```

## What it does

The script reads every PNG in `assets/`, uploads each to the `assets` bucket under a `logos/` prefix, prints a presigned view URL for each, and then lists the objects in the bucket — all through the Files SDK's `neon` adapter:

```ts
import { Files } from 'files-sdk';
import { neon } from 'files-sdk/neon';

const files = new Files({ adapter: neon({ bucket: 'assets' }) });

await files.upload('logos/neon-logo.png', body, { contentType: 'image/png' });
const url = await files.url('logos/neon-logo.png', { expiresIn: 3600 });
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

## Install dependencies

```bash
npm install
```

## Link your Neon project

> Object storage is a preview feature available only on **new** projects in the **`us-east-2`** region. Create one there before linking.

```bash
neon link
```

If you let your agent drive this, add `--agent` to skip interactive mode.

## Provision the bucket

Provision the bucket declared in `neon.ts` on your linked branch:

```bash
neon deploy
```

> `neon deploy` automatically runs an `env pull` that mints a branch S3 credential and writes the `AWS_*` variables to `.env.local`, which the script loads at startup.

## Run the script

```bash
npx tsx src/index.ts
```

You'll see each asset uploaded with a presigned view URL, followed by a listing of the objects now in your bucket. Open a presigned URL in the browser to confirm the upload.

## Explore the bucket from the CLI

```bash
# List objects
neon bucket object list assets

# Download one back
neon bucket object get assets logos/neon-logo.svg ./neon-logo.svg
```
