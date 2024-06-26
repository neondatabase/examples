<img width="250px" src="https://raw.githubusercontent.com/neondatabase/website/a898a3ff9c2786a3fd4691d083eb8f3c751e008b/src/images/logo-white.svg" />

# Getting started with Neon and Railway

This is the code repository for the guide on how to [deploy a Node application with Neon to Render](https://neon.tech/docs/guides/render). Follow the guide to set up the Neon project and your Render application. 

## Store your Neon credentials

Run the command below to copy the `.env.example` file:

```
cp .env.example .env
```

Store your Neon credentials in this `.env` file.

```
DATABASE_URL="postgres://<user>:<password>@<endpoint_hostname>.neon.tech:<port>/<dbname>?sslmode=require"
```

- `user` is the database user.
- `password` is the database user’s password.
- `endpoint_hostname` is the host with neon.tech as the [TLD](https://www.cloudflare.com/en-gb/learning/dns/top-level-domain/).
- `port` is the Neon port number. The default port number is 5432.
- `dbname` is the name of the database. “neondb” is the default database created with each Neon project.
- `?sslmode=require` an optional query parameter that enforces the [SSL](https://www.cloudflare.com/en-gb/learning/ssl/what-is-ssl/) mode while connecting to the Postgres instance for better security.

**Important**: To ensure the security of your data, never expose your Neon credentials to the browser.

## Test the application locally

Run the command below to deploy the application locally:

```bash
node --env-file=.env index.js
```

## Deploy the application to Render platform

Follow the guide for instructions on how to deploy the application to the Render platform, and set up automatic deployments with GitHub.