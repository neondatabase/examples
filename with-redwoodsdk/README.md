<img width="250px" src="https://neon.tech/brand/neon-logo-dark-color.svg" />

# Getting started with Neon and RedwoodSDK

## Clone the repository

```shell
npx degit neondatabase/examples/with-redwoodsdk ./with-redwoodsdk
cd with-redwoodsdk
npm install
```

Run the command below to copy the `.env.example` file:

```
cp .dev.vars.example .dev.vars
```

## Store your Neon credentials

Store your Neon credentials in your `.dev.vars` file.

```
DATABASE_URL="postgresql://neondb_owner:...@ep-...us-east-1.aws.neon.tech/neondb?sslmode=require"
```

- `user` is the database user.
- `password` is the database user’s password.
- `endpoint_hostname` is the host with neon.tech as the [TLD](https://www.cloudflare.com/en-gb/learning/dns/top-level-domain/).
- `dbname` is the name of the database. “neondb” is the default database created with each Neon project.
- `?sslmode=require` an optional query parameter that enforces the [SSL](https://www.cloudflare.com/en-gb/learning/ssl/what-is-ssl/) mode while connecting to the Postgres instance for better security.


## Running the dev server

```shell
npm run dev
```

Once the server is running, navigate to your application's URL ([`localhost:5173`](http://localhost:5173/)) in your browser. You should see a message confirming the database connection and displaying the PostgreSQL version, similar to:


```text
PostgreSQL 17.4 on x86_64-pc-linux-gnu, compiled by gcc (Debian 12.2.0-14) 12.2.0, 64-bit
```
> The specific version may vary depending on the PostgreSQL version of your Neon project

## Resources

- [Connect a RedwoodSDK application to Neon](https://neon.tech/docs/guides/redwoodsdk)
- [RedwoodSDK Documentation](https://docs.rwsdk.com/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers)
