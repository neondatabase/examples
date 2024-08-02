<img width="250px" src="https://raw.githubusercontent.com/neondatabase/website/a898a3ff9c2786a3fd4691d083eb8f3c751e008b/src/images/logo-white.svg" />

# Getting started with Neon and Netlify functions

This is the code repository for the guide on [how to deploy a Netlify functions application with Neon](https://neon.tech/docs/guides/netlify-functions). Follow the guide to set up your Neon project and configure the Netlify CLI. 

## Store your Neon credentials

Run the command below to copy the `.env.example` file, to the `neon-netlify-example` directory, and rename it to `.env`.

```
cp .env.example neon-netlify-example/.env
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

## Initialize a Netlify site

Change to the `neon-netlify-example` directory and run the command below to install project dependencies:

```bash
cd neon-netlify-example && npm install
```

Run the command below to initialize a new Netlify site:

```bash
netlify sites:create
```

Test running the application locally by running the command below:

```bash
netlify dev
```

## Deploy the application to Netlify platform

Follow the [guide](https://neon.tech/docs/guides/netlify-functions#deploying-your-netlify-site-and-function) for further instructions on how to deploy the functions to the Netlify platform.