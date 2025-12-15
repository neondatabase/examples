<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Encore

This example demonstrates how to connect an Encore.ts application to a Neon Postgres database.

[Encore](https://encore.dev) is a backend development framework that uses static analysis and type-safe primitives to provide automatic infrastructure provisioning, distributed tracing, and API documentation.

## Prerequisites

- [Encore CLI](https://encore.dev/docs/install) installed
- A [Neon](https://console.neon.tech) account and project

## Clone the repository

```bash
npx degit neondatabase/examples/with-encore ./with-encore
cd with-encore
```

## Store your Neon credentials

Set your Neon database connection string as a secret using Encore's built-in secrets manager:

```bash
encore secret set --type local DatabaseURL
```

When prompted, paste your Neon connection string. You can find it in the **Connection Details** section of your Neon project dashboard.

The connection string format:

```
postgresql://<user>:<password>@<endpoint_hostname>.neon.tech:<port>/<dbname>?sslmode=require
```

- `user` is the database user
- `password` is the database user's password
- `endpoint_hostname` is the host with neon.tech as the [TLD](https://www.cloudflare.com/en-gb/learning/dns/top-level-domain/)
- `dbname` is the name of the database (default: "neondb")
- `?sslmode=require` enforces SSL mode for secure connections

**Important**: Never expose your Neon credentials to the browser or in your code.

## Run the application

Start the Encore development server:

```bash
encore run
```

The app will be available at `http://localhost:4000` and the local development dashboard at `http://localhost:9400`.

## Test the API

Create a message:

```bash
curl -X POST http://localhost:4000/messages \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from Neon!"}'
```

List all messages:

```bash
curl http://localhost:4000/messages
```

## Project structure

- `hello/` - The service directory
  - `encore.service.ts` - Service definition
  - `db.ts` - Database configuration with Neon connection
  - `hello.ts` - API endpoints
  - `migrations/` - Database migrations

## Learn more

- [Encore Documentation](https://encore.dev/docs)
- [Neon + Encore Integration Guide](https://neon.tech/docs/guides/encore)
- [Encore SQL Databases](https://encore.dev/docs/ts/primitives/databases)
- [Building Production API Services with Encore and Neon](https://neon.tech/blog/building-production-api-services-with-encore-typescript-and-neon-serverless-postgres)

