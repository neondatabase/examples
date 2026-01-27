<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and FastAPI

This example demonstrates how to connect a FastAPI application to a Neon PostgreSQL database using SQLAlchemy 2.0 with async support.

## Prerequisites

- Python 3.10 or later
- A [Neon](https://neon.com) account and project

## Clone the repository

```bash
npx degit neondatabase/examples/with-fastapi ./with-fastapi
cd with-fastapi
```

## Set up your environment

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Update `.env` with your Neon database connection string:

```
DATABASE_URL="postgresql://neondb_owner:...@ep-...us-east-1.aws.neon.tech/neondb?sslmode=require"
```

For production, consider using Neon's [connection pooler](https://neon.com/docs/connect/connection-pooling) by adding `-pooler` to your endpoint hostname.

## Install dependencies

Create and activate a virtual environment:

```bash
# Create virtual environment
python -m venv venv

# Activate (macOS/Linux)
source ./venv/bin/activate

# Activate (Windows)
.\venv\Scripts\activate
```

Install the required packages:

```bash
pip install -r requirements.txt
```

## Create the database table

The application will automatically create the `playing_with_neon` table on startup. Alternatively, you can create it manually in the [Neon SQL Editor](https://neon.com/docs/get-started-with-neon/query-with-neon-sql-editor):

```sql
CREATE TABLE IF NOT EXISTS playing_with_neon (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    value REAL
);

-- Insert sample data
INSERT INTO playing_with_neon (name, value) VALUES ('Sample Record', 42.0);
```

## Run the application

Start the FastAPI development server:

```bash
fastapi dev main.py
```

The API will be available at `http://localhost:8000`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check with database connectivity |
| GET | `/records` | List all records (supports `skip` and `limit` query params) |
| GET | `/records/{id}` | Get a specific record by ID |
| POST | `/records` | Create a new record |
| PATCH | `/records/{id}` | Update an existing record |
| DELETE | `/records/{id}` | Delete a record |

### Interactive API Documentation

FastAPI provides automatic interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Project Structure

```
with-fastapi/
├── main.py              # FastAPI application entry point
├── requirements.txt     # Python dependencies
├── .env.example         # Example environment variables
└── app/
    ├── __init__.py
    ├── config.py        # Pydantic settings configuration
    ├── db.py            # SQLAlchemy async engine and session
    ├── models.py        # SQLAlchemy ORM models
    └── api/
        ├── __init__.py
        ├── crud.py      # Database CRUD operations
        ├── records.py   # API route handlers
        └── schemas.py   # Pydantic request/response schemas
```

## Learn More

- [Neon Documentation](https://neon.com/docs)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SQLAlchemy Async Documentation](https://docs.sqlalchemy.org/en/latest/orm/extensions/asyncio.html)
- [Neon Connection Pooling](https://neon.com/docs/connect/connection-pooling)
