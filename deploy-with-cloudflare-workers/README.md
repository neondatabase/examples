<img width="250px" src="https://raw.githubusercontent.com/neondatabase/website/a898a3ff9c2786a3fd4691d083eb8f3c751e008b/src/images/logo-white.svg" />

# Getting started with Neon and Cloudflare Workers

This is the code repository for the guide on how to [deploy a Cloudflare worker application using Neon](https://neon.tech/docs/guides/cloudflare-workers). Follow the guide to set up the Neon project and your Cloudflare application. 

## Store your Neon credentials

Run the command below to copy the `.env.example` file to a `.dev.vars` file in the code directory:

```
cp .env.example my-neon-worker/.dev.vars
```

Store your Neon credentials in this `.dev.vars` file.

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

Navigate to the `my-neon-worker` directory, and install the dependencies:

```bash
cd my-neon-worker && npm install
```

Now, run the command below to deploy the application locally:

```bash
npx wrangler dev
```

## Deploy the application to Cloudflare platform

Follow the guide for instructions on how to deploy the application to the Cloudflare Workers platform. Make sure to add the Neon connection string as a secret to your Worker application.