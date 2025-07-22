<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Railway

This is the code repository for the guide on how to [deploy a Node application with Neon to Railway](https://neon.tech/docs/guides/railway). Follow the guide to set up the Neon project and your Railway application. 

## Store your Neon credentials

Run the command below to copy the `.env.example` file, to the `neon-railway-example` directory, and rename it to `.env`.

```bash
cp .env.example neon-railway-example/.env
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

## Test the application locally

Change to the `neon-railway-example` directory and run the command below to install project dependencies:

```bash
cd neon-railway-example && npm install
```

Then, run the command below to test the application locally:

```bash
node --env-file=.env index.js
```

## Deploy the application to Railway platform

Follow the guide for instructions on how to deploy the application to the Railway platform, and set up automatic deployments with GitHub.