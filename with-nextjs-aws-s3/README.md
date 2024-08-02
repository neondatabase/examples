<img width="250px" src="https://raw.githubusercontent.com/neondatabase/website/a898a3ff9c2786a3fd4691d083eb8f3c751e008b/src/images/logo-white.svg" />

# Getting started with Neon, Next.js and AWS S3

## Clone the repository

```bash
npx degit neondatabase/examples/with-nextjs-aws-s3 ./with-nextjs-aws-s3
```

Read more on [How to upload to S3 in Next.js and save references in Postgres](https://neon.tech/guides/next-upload-aws-s3).

Run the command below to copy the `.env.example` file:

```
cp .env.example .env
```

## Store your Neon credentials

Store your Neon credentials in your `.env` file.

```
DATABASE_URL="postgresql://neondb_owner:...@ep-...us-east-1.aws.neon.tech/neondb?sslmode=require"
```

- `user` is the database user.
- `password` is the database user’s password.
- `endpoint_hostname` is the host with neon.tech as the [TLD](https://www.cloudflare.com/en-gb/learning/dns/top-level-domain/).
- `dbname` is the name of the database. “neondb” is the default database created with each Neon project.
- `?sslmode=require` an optional query parameter that enforces the [SSL](https://www.cloudflare.com/en-gb/learning/ssl/what-is-ssl/) mode while connecting to the Postgres instance for better security.

**Important**: To ensure the security of your data, never expose your Neon credentials to the browser.

Run the command below to install project dependencies:

```
npm install
```

Run the Next.js application using the following command:

```
npm run dev
```
