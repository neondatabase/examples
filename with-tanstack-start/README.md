<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and TanStack Start

## Clone the repository

```bash
npx degit neondatabase/examples/with-tanstack-start ./with-tanstack-start
```

## Create a .env file

Run the command below to copy the `.env.example` file:

```bash
cp .env.example .env
```

## Get your Neon credentials

Obtain the database connection string from the Connection Details widget on the [Neon Dashboard](https://pg.new).

## Add your database URL to the .env file

Update the `.env` file with your database connection string:

```txt
# The connection string has the format `postgres://user:pass@host/db`
DATABASE_URL=<your-string-here>
```

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

Your application will be available at `http://localhost:3000`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.