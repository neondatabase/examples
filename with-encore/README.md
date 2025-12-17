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

## Run the application locally

Start the Encore development server:

```bash
encore run
```

Encore automatically provisions a **local PostgreSQL database** for development. The app will be available at `http://localhost:4000` and the local development dashboard at `http://localhost:9400`.

> **Note:** Local development uses Encore's built-in Postgres database, not Neon. To use Neon, deploy your app to Encore Cloud and configure Neon as your database provider. See the "Using Neon in Production" section below.

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
  - `db.ts` - Database configuration
  - `hello.ts` - API endpoints
  - `migrations/` - Database migrations

## Using Neon in production

To use Neon for your production database:

1. **Create a Neon account** at [console.neon.tech](https://console.neon.tech)
2. **Deploy to Encore Cloud:**
   ```bash
   git add -A
   git commit -m "Initial commit"
   git push encore
   ```
3. **Configure Neon in Encore Cloud:**
   - Get your Neon API key from the [Neon Console](https://console.neon.tech/app/settings/api-keys)
   - Add it in the [Encore Dashboard](https://app.encore.cloud) under **Settings → Integrations → Neon**
   - Create a production environment and select Neon as the database provider

Encore will automatically create a Neon database in your account, run migrations, and configure all connections. Preview environments will get their own Neon database branches automatically.

For detailed instructions, see the [Neon + Encore Integration Guide](https://neon.tech/docs/guides/encore).

## Learn more

- [Encore Documentation](https://encore.dev/docs)
- [Neon + Encore Integration Guide](https://neon.tech/docs/guides/encore)
- [Encore SQL Databases](https://encore.dev/docs/ts/primitives/databases)
- [Building Production API Services with Encore and Neon](https://neon.tech/blog/building-production-api-services-with-encore-typescript-and-neon-serverless-postgres)

