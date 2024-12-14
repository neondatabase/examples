<img width="250px" src="https://neon.tech/brand/neon-logo-dark-color.svg" />

# Getting started with Neon and Cloudflare Hyperdrive

## Clone the repository

```bash
npx degit neondatabase/examples/with-hyperdrive ./with-hyperdrive
```

## Get your Neon credentials

```
DATABASE_URL="postgresql://neondb_owner:...@ep-...us-east-1.aws.neon.tech/neondb?sslmode=require"
```

- `user` is the database user.
- `password` is the database user’s password.
- `endpoint_hostname` is the host with neon.tech as the [TLD](https://www.cloudflare.com/en-gb/learning/dns/top-level-domain/).
- `dbname` is the name of the database. “neondb” is the default database created with each Neon project.
- `?sslmode=require` an optional query parameter that enforces the [SSL](https://www.cloudflare.com/en-gb/learning/ssl/what-is-ssl/) mode while connecting to the Postgres instance for better security.

**Important**: To ensure the security of your data, never expose your Neon credentials to the browser.

## Create a database configuration

To create a Hyperdrive configuration with the Wrangler CLI, open your terminal and run the following command:

```bash
npx wrangler hyperdrive create <NAME_OF_HYPERDRIVE_CONFIG> --connection-string="postgresql://neondb_owner:...@ep-...us-east-1.aws.neon.tech/neondb?sslmode=require"
```

This command outputs a binding to be used in the `wrangler.toml` file:

```toml
name = "hyperdrive-example"
main = "src/index.ts"
compatibility_date = "2024-08-21"
compatibility_flags = ["nodejs_compat"]

# Pasted from the output of `wrangler hyperdrive create <NAME_OF_HYPERDRIVE_CONFIG> --connection-string=[...]` above.
[[hyperdrive]]
binding = "HYPERDRIVE"
id = "<ID OF THE CREATED HYPERDRIVE CONFIGURATION>"
```

Run the command below to install project dependencies:

```
npm install
```

Deploy the Cloudflare worker using the following command:

```
npm run deploy
```
