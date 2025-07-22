<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Deno

This is the code repository for the guide on [how to deploy a Deno application with Neon](https://neon.tech/docs/guides/deno#deploy-your-application-with-deno-deploy). Follow the guide to install all the prerequisites.

## Store your Neon credentials

Run the command below to copy the `.env.example` file:

```
cp .env.example .env
```

Store your Neon credentials in this `.env` file.

```
DATABASE_URL="postgresql://neondb_owner:...@ep-...us-east-1.aws.neon.tech/neondb?sslmode=require"
```

- `user` is the database user.
- `password` is the database user’s password.
- `endpoint_hostname` is the host with neon.tech as the [TLD](https://www.cloudflare.com/en-gb/learning/dns/top-level-domain/).
- `dbname` is the name of the database. “neondb” is the default database created with each Neon project.
- `?sslmode=require` an optional query parameter that enforces the [SSL](https://www.cloudflare.com/en-gb/learning/ssl/what-is-ssl/) mode while connecting to the Postgres instance for better security.

**Important**: To ensure the security of your data, never expose your Neon credentials to the browser.

## Deploy the application locally

Run the command below to deploy the application locally:

```
export $(grep -v '^#' .env | xargs) && deno run --allow-env --allow-net server.ts
```

## Deploy the application to Deno Deploy platform

Follow the guide to learn how to deploy to the Deno Deploy platform.