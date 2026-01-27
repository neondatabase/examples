from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from sqlalchemy import select

from app.api import records
from app.db import Base, async_session_maker, engine
from app.models import Record


async def seed_sample_data():
    """Seed the database with sample records if empty."""
    async with async_session_maker() as session:
        result = await session.execute(select(Record).limit(1))
        if result.scalar() is None:
            sample_records = [
                Record(name="Hello Neon", value=1.0),
                Record(name="FastAPI Example", value=2.5),
                Record(name="Serverless Postgres", value=42.0),
            ]
            session.add_all(sample_records)
            await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle - startup and shutdown events."""
    # Startup: Create database tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Seed sample data if table is empty
    await seed_sample_data()
    yield
    # Shutdown: Dispose of the engine connection pool
    await engine.dispose()


app = FastAPI(
    title="Neon FastAPI Example",
    description="A FastAPI application demonstrating Neon PostgreSQL integration",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def root():
    """Welcome page with links to API endpoints."""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Neon + FastAPI</title>
        <style>
            body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            h1 { color: #00e699; }
            a { color: #00e699; }
            ul { line-height: 2; }
            code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
        </style>
    </head>
    <body>
        <h1>Neon + FastAPI Example</h1>
        <p>A FastAPI application connected to Neon serverless Postgres.</p>
        
        <h2>Quick Links</h2>
        <ul>
            <li><a href="/docs">Interactive API Documentation (Swagger UI)</a></li>
            <li><a href="/redoc">API Documentation (ReDoc)</a></li>
            <li><a href="/health">Health Check</a></li>
            <li><a href="/records">List All Records</a></li>
        </ul>
        
        <h2>API Endpoints</h2>
        <ul>
            <li><code>GET /health</code> - Database connectivity check</li>
            <li><code>GET /records</code> - List all records</li>
            <li><code>GET /records/{id}</code> - Get a specific record</li>
            <li><code>POST /records</code> - Create a new record</li>
            <li><code>PATCH /records/{id}</code> - Update a record</li>
            <li><code>DELETE /records/{id}</code> - Delete a record</li>
        </ul>
        
        <p>Visit <a href="https://neon.com">neon.com</a> to learn more about Neon.</p>
    </body>
    </html>
    """


app.include_router(records.router)
