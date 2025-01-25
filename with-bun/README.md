<img width="250px" src="https://neon.tech/brand/neon-logo-dark-color.svg" />

# Getting started with Neon and Bun

## Clone the repository

```bash
bunx degit neondatabase/examples/with-bun ./with-bun
```

Move into the project directory:

```bash
cd with-bun
```

Run the command below to copy the `.env.example` file:

```
cp .env.example .env.local
```

## Store your Neon credentials

Store your Neon credentials in your `.env` file.

```
POSTGRES_URL="postgresql://neondb_owner:...@ep-...us-east-1.aws.neon.tech/neondb?sslmode=require"
```

- `user` is the database user.
- `password` is the database user’s password.
- `endpoint_hostname` is the host with neon.tech as the [TLD](https://www.cloudflare.com/en-gb/learning/dns/top-level-domain/).
- `dbname` is the name of the database. “neondb” is the default database created with each Neon project.
- `?sslmode=require` an optional query parameter that enforces the [SSL](https://www.cloudflare.com/en-gb/learning/ssl/what-is-ssl/) mode while connecting to the Postgres instance for better security.

**Important**: To ensure the security of your data, never expose your Neon credentials to the browser.

Run the command below to install project dependencies:

```bash
bun install
```

Run the Bun application using the following command:

```bash
bun run using-bun-sql.ts # for using Bun.sql
bun run run using-neon-serverless-driver.ts # for using Neon Serverless Driver
```
