# Spring Boot Kotlin with Neon Postgres

This example demonstrates how to connect a Spring Boot Kotlin application to a Neon Postgres database.

## Prerequisites

- [JDK 17+](https://www.oracle.com/java/technologies/javase-downloads.html)
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
./gradlew clean build bootRun
```

The application will start on port 8080. You can test it with:

```bash
# List all users
curl http://localhost:8080/users

# Get a specific user
curl http://localhost:8080/users/1

# Create a new user
curl -X POST -H "Content-Type: application/json" \
     -d '{"name":"Charlie","email":"charlie@example.com"}' \
     http://localhost:8080/users

# Search users by name
curl "http://localhost:8080/users/search?name=Ali"
```

## Project Structure

- `src/main/kotlin/com/example/User.kt` - Entity class representing a user
- `src/main/kotlin/com/example/UserRepository.kt` - Repository interface for database operations
- `src/main/kotlin/com/example/UserController.kt` - REST controller for the API
- `src/main/resources/application.yml` - Application configuration including database connection
- `src/main/resources/db/migration/V1__create_users.sql` - Database migration script

## Learn More

- [Neon Documentation](https://neon.tech/docs)
- [Spring Boot Reference](https://docs.spring.io/spring-boot/docs/current/reference/html/)