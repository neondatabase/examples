# Next.js application with Neon Postgres and Auth.js authentication

This is a Next.js application that uses `Neon Postgres` as the database and `Auth.js` for user authentication. It allows users to log in using magic links and manage a simple todo list.

## Prerequisites

To run this project, you will need:

- A [Neon](https://neon.tech) account and a project with a Postgres database
- A [Resend](https://resend.com/) account for sending authentication emails
- Node.js and npm installed on your machine

## Set up locally

1. Clone this repository, and check navigate to this subfolder. Install the dependencies using `npm`.

```bash
npm install
```

2. Copy the `.env.example` file, with the following environment variables, to create a `.env` file. 

```bash
DATABASE_URL=YOUR_NEON_DATABASE_URL
AUTH_RESEND_KEY=YOUR_RESEND_API_KEY
AUTH_SECRET=YOUR_AUTH_SECRET
```

Replace the placeholders with your actual Neon database URL, Resend API key, and an Auth secret generated using `npx auth secret`.

3. Apply the database schema using the SQL file provided in `app/db/schema.sql`. You can use the Neon SQL Editor or a tool like `psql` to do this.

4. Start the development server.

```bash
npm run dev
```

5. Open your browser and navigate to `http://localhost:3000`. You should see the application running.

## Usage

This Next.js application has a single page that lets you manage a todo list. When unauthenticated, you will see a sign-in link.

- Click on the sign-in link and enter your email address to receive a magic link.
- Click the magic link in your email to log in (note: if using the Resend test email, this only works for the email you used to sign up for Resend).
- Once logged in, you can add new todos by typing into the input field and clicking "Add".
- Click on a todo to toggle its completed status.
- You can sign out using the "Sign Out" link at the bottom of the page.
