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

## Database Migrations

When the application starts, Flyway will automatically run the migration scripts located in `src/main/resources/db/migration` to set up the database schema.

You should see the following logs on the initial startup:

```bash
$ ./gradlew run

[test-resources-service] 15:48:33.940 [main] INFO  i.m.c.DefaultApplicationContext$RuntimeConfiguredEnvironment - Established active environments: [test]

> Task :run
 __  __ _                                  _   
|  \/  (_) ___ _ __ ___  _ __   __ _ _   _| |_ 
| |\/| | |/ __| '__/ _ \| '_ \ / _` | | | | __|
| |  | | | (__| | | (_) | | | | (_| | |_| | |_ 
|_|  |_|_|\___|_|  \___/|_| |_|\__,_|\__,_|\__|
15:48:43.830 [main] INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-1 - Starting...
15:48:45.974 [main] INFO  com.zaxxer.hikari.pool.HikariPool - HikariPool-1 - Added connection org.postgresql.jdbc.PgConnection@30506c0d
15:48:45.975 [main] INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-1 - Start completed.
15:48:46.126 [main] INFO  i.m.flyway.AbstractFlywayMigration - Running migrations for database with qualifier [default]
15:48:46.298 [main] INFO  org.flywaydb.core.FlywayExecutor - Database: jdbc:postgresql://endpoint.neon.tech/examples?sslmode=require&channelBinding=require (PostgreSQL 17.5)
15:48:48.110 [main] INFO  o.f.c.i.s.JdbcTableSchemaHistory - Schema history table "public"."flyway_schema_history" does not exist yetn
15:48:48.250 [main] INFO  o.f.core.internal.command.DbValidate - Successfully validated 1 migration (execution time 00:00.432s)
15:48:49.524 [main] INFO  o.f.c.i.s.JdbcTableSchemaHistory - Creating Schema History table "public"."flyway_schema_history" ...
15:48:51.817 [main] INFO  o.f.core.internal.command.DbMigrate - Current version of schema "public": << Empty Schema >>
15:48:52.243 [main] INFO  o.f.core.internal.command.DbMigrate - Migrating schema "public" to version "1 - create book table"
15:48:54.757 [main] INFO  o.f.core.internal.command.DbMigrate - Successfully applied 1 migration to schema "public", now at version v1 (execution time 00:00.969s)
15:48:55.841 [main] INFO  io.micronaut.runtime.Micronaut - Startup completed in 12788ms. Server Running: http://localhost:8080 :run
<============-> 92% EXECUTING [38s]
> :run
> IDLE
```

The logs indicate the following sequence of events:
- HikariCP initializes the connection pool to the Neon Postgres database.
- Flyway checks the database schema and found that the `flyway_schema_history` table does not exist.
- Flyway creates the `flyway_schema_history` table and applies the migrations present in the migration folder.
- The `book` table is created as per the migration script (i.e., `V1__create_book_table.sql`).
- The application starts successfully and is ready to handle requests.

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
