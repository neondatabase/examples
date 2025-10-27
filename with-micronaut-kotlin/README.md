# Micronaut Kotlin with Neon Postgres

This example demonstrates how to connect a Micronaut Kotlin application to a Neon Postgres database.

## Prerequisites

- [JDK 21](https://www.oracle.com/java/technologies/javase-downloads.html)
- [Gradle](https://gradle.org/install/) (or use the included Gradle wrapper)
- [Neon account](https://neon.com)

## Setup

1. Create a Neon project from the [Neon Console](https://console.neon.tech)
2. Get your connection string from the Neon Console
3. Update the datasource configuration in `src/main/resources/application.yml` with your Neon database credentials:

```yaml
datasources:
  default:
    url: "jdbc:postgresql://endpoint.neon.tech/dbname?sslmode=require&channelBinding=require" # replace with your Neon endpoint and database name
    username: "<your-db-username>" # Replace with your Neon database username
    password: "<your-db-password>" # Replace with your Neon database password
    driver-class-name: org.postgresql.Driver
    db-type: postgres
    dialect: POSTGRES
```

## Run the application

```bash
./gradlew run
```

The application will start on port 8080. You can test it with:

```bash
# Get all books
curl http://localhost:8080/books

# Get a specific book
curl http://localhost:8080/books/1

# Create a new book
curl -X POST http://localhost:8080/books -H "Content-Type: application/json" -d '{"title":"The Great Gatsby","author":"F. Scott Fitzgerald"}'
```

## Project Structure

- `src/main/kotlin/com/example/entity/Book.kt` - Entity class representing a book
- `src/main/kotlin/com/example/repository/BookRepository.kt` - Repository interface for database operations
- `src/main/kotlin/com/example/controller/BookController.kt` - REST controller for the API
- `src/main/resources/application.yml` - Application configuration including database connection
- `src/main/resources/db/migration/V1__create_book_table.sql` - Database migration script

## Learn More

- [Neon Documentation](https://neon.tech/docs)
- [Micronaut Documentation](https://docs.micronaut.io/)
- [Micronaut API Reference](https://docs.micronaut.io/4.10.7/api/)
- [Micronaut Schema Migration with Flyway](https://guides.micronaut.io/latest/micronaut-flyway-maven-java.html)
- [Micronaut Data JDBC documentation](https://micronaut-projects.github.io/micronaut-data/latest/guide/index.html#jdbc)
- [Micronaut Hikari JDBC Connection Pool documentation](https://micronaut-projects.github.io/micronaut-sql/latest/guide/index.html#jdbc)
- [Flyway](https://www.red-gate.com/products/flyway/community/)
