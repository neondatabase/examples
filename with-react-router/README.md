<img width="250px" src="https://neon.tech/brand/neon-logo-dark-color.svg" />

# Getting started with Neon and React Router

## Clone the repository

```bash
npx degit neondatabase/examples/with-react-router ./with-react-router
```

## Create a .env file

Run the command below to copy the `.env.example` file:

```bash
cp .env.example .env
```

## Store your Neon credentials

Store your Neon credentials in the `.env` file. You can obtain the connection string for your database from the Connection Details widget on the Neon Dashboard.

```
DATABASE_URL="postgresql://neondb_owner:...@ep-...us-east-1.aws.neon.tech/neondb?sslmode=require"
```

- `user` is the database user.
- `password` is the database user’s password.
- `endpoint_hostname` is the host with neon.tech as the [TLD](https://www.cloudflare.com/en-gb/learning/dns/top-level-domain/).
- `dbname` is the name of the database. “neondb” is the default database created with each Neon project.
- `?sslmode=require` an optional query parameter that enforces the [SSL](https://www.cloudflare.com/en-gb/learning/ssl/what-is-ssl/) mode while connecting to the Postgres instance for better security.

**Important**: To ensure the security of your data, never expose your Neon credentials to the browser.

## Install dependencies

Run the command below to install project dependencies:

```bash
npm install
```

## Development

Run the application using the following command:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

React Router can be deployed to many different deployment targets including Vercel, Netlify, Cloudflare Workers, and more. Check out [React Router's official templates on GitHub](https://github.com/remix-run/react-router-templates) for more information. This template is based on React Router's default template running a standard Node server. It also ships with example Docker files for dockerized deployments.

### Docker Deployment

This template includes three Dockerfiles optimized for different package managers:

- `Dockerfile` - for npm
- `Dockerfile.pnpm` - for pnpm
- `Dockerfile.bun` - for bun

To build and run using Docker:

```bash
# For npm
docker build -t my-app .

# For pnpm
docker build -f Dockerfile.pnpm -t my-app .

# For bun
docker build -f Dockerfile.bun -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

