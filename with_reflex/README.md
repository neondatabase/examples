<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Reflex

## Clone the repository

```bash
npx degit neondatabase/examples/with_reflex ./with-reflex
```

Run the command below to copy the `.env.example` file:

```
cp .env.example .env
```

## Store your Neon credentials

Store your Neon credentials in your `.env` file.

```
DATABASE_URL="postgresql://neondb_owner:...@ep-...us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

- `user` is the database user.
- `password` is the database user’s password.
- `endpoint_hostname` is the host with neon.tech as the [TLD](https://www.cloudflare.com/en-gb/learning/dns/top-level-domain/).
- `dbname` is the name of the database. “neondb” is the default database created with each Neon project.
- `?sslmode=require&channel_binding=require` are used to enforce secure connections.

**Important**: To ensure the security of your data, never expose your Neon credentials to the browser.


Create a virtual environment and activate it:

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
```

Run the command below to install project dependencies:

```
pip install -r requirements.txt
```

Apply database migrations:

```
reflex migrate
```

Start the development server:

```
reflex run
```

Open your browser and navigate to `http://localhost:3000` to see the application in action.
