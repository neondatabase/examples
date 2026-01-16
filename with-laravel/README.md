# Laravel with Neon Postgres

A Laravel 11 application configured to use [Neon](https://neon.tech) serverless Postgres.

## Why Neon?

- **Instant provisioning** - Create databases in seconds, not minutes
- **Serverless scaling** - Automatically scales compute based on demand
- **Database branching** - Create isolated database copies for development and testing
- **Cost efficient** - Pay only for storage and compute you actually use

## Quick Start

```bash
# Install dependencies
composer install

# Configure environment
cp .env.example .env
php artisan key:generate

# Add your Neon connection string to .env
# DB_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require

# Run migrations and seed
php artisan migrate --seed

# Start development server
php artisan serve
```

Visit `http://localhost:8000` to see the welcome page, or `http://localhost:8000/db-test` to verify database connectivity.

## Configuration

The application uses Laravel's `DB_URL` environment variable for Neon connection. Get your connection string from the [Neon Console](https://console.neon.tech).

## Resources

- [Neon Documentation](https://neon.tech/docs)
- [Laravel Documentation](https://laravel.com/docs)
- [Neon + Laravel Guide](https://neon.tech/docs/guides/laravel)
