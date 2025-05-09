# Micronaut Kotlin with Neon Postgres

This example demonstrates how to connect a Micronaut Kotlin application to a Neon Postgres database.

## Prerequisites

- [JDK 11+](https://www.oracle.com/java/technologies/javase-downloads.html)
- [Gradle](https://gradle.org/install/) (or use the included Gradle wrapper)
- [Neon account](https://neon.tech)

## Setup

1. Create a Neon project from the [Neon Console](https://console.neon.tech)
2. Get your connection string from the Neon Console
3. Create a `.env` file in the project root with your Neon credentials:

```
JDBC_DATABASE_URL=jdbc:postgresql://<user>:<password>@<endpoint_hostname>.neon.tech:<port>/<dbname>?sslmode=require
JDBC_DATABASE_USERNAME=<user>
JDBC_DATABASE_PASSWORD=<password>
```

## Running the application

```bash
# Using the Gradle wrapper
./gradlew run
```

The application will start on port 8080. You can test it with:

```bash
# Get all books
curl http://localhost:8080/books

# Get a specific book
curl http://localhost:8080/books/1

# Create a new book
curl -X POST -H "Content-Type: application/json" -d '{"title":"The Great Gatsby","author":"F. Scott Fitzgerald"}' http://localhost:8080/books
```

## Project Structure

- `src/main/kotlin/com/example/entity/Book.kt` - Entity class representing a book
- `src/main/kotlin/com/example/repository/BookRepository.kt` - Repository interface for database operations
- `src/main/kotlin/com/example/controller/BookController.kt` - REST controller for the API
- `src/main/resources/application.yml` - Application configuration including database connection
- `src/main/resources/db/migration/V1__create_book_table.sql` - Database migration script

## Learn More

- [Neon Documentation](https://neon.tech/docs)
- [Micronaut Documentation](https://micronaut.io/documentation/)
