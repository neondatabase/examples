# Getting started with Neon and Electric SQL

## Requirements

- [Node.js](https://nodejs.org/en)
- [Docker](https://www.docker.com/)

## Project Structure

- `docker-compose.yaml`: Defines the Electric SQL service configuration.
- `react-app/src/App.tsx`: Contains a React component that uses Electric SQL.

## Store your Neon credentials

**Store your Neon credentials in the `docker-compose.yaml` file.**

```
DATABASE_URL="postgresql://neondb_owner:...@ep-...us-east-1.aws.neon.tech/neondb?sslmode=require"
```

- `user` is the database user.
- `password` is the database user’s password.
- `endpoint_hostname` is the host with neon.tech as the [TLD](https://www.cloudflare.com/en-gb/learning/dns/top-level-domain/).
- `dbname` is the name of the database. “neondb” is the default database created with each Neon project.
- `?sslmode=require` an optional query parameter that enforces the [SSL](https://www.cloudflare.com/en-gb/learning/ssl/what-is-ssl/) mode while connecting to the Postgres instance for better security.

## Docker Compose Configuration

The `docker-compose.yaml` file sets up the Electric SQL service:

- Uses the `electricsql/electric` image
- Connects to a PostgreSQL database (Neon DB in this case)
- Exposes port 3000

## React Application

The `App.tsx` file contains a simple React component that:

- Uses the `useShape` hook from `@electric-sql/react`
- Fetches data from `http://localhost:3000/v1/shape/foo`
- Renders the fetched data as a JSON string

To customize the application, modify the `url` in the `useShape` hook and adjust the rendering logic as needed.

## Getting Started

1. Start the Electric SQL service:
   ```
   docker compose up
   ```

2. Run the React application:
   ```
   cd react-app && npm run dev
   ```