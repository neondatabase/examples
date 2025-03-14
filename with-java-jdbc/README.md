<img width="250px" src="https://neon.tech/brand/neon-logo-dark-color.svg" />

# Getting started with Neon and Java using JDBC

## Clone the repository

```bash
npx degit neondatabase/examples/with-java-jdbc ./with-java-jdbc
```

Run the command below to copy the `.env.example` file:

```
cp .env.example .env
```

## Store your Neon credentials

Store your Neon credentials in your `.env` file.

```
DATABASE_URL="postgresql://neondb_owner:...@ep-...us-east-1.aws.neon.tech/neondb?sslmode=require"
```

- `user` is the database user.
- `password` is the database user's password.
- `endpoint_hostname` is the host with neon.tech as the [TLD](https://www.cloudflare.com/en-gb/learning/dns/top-level-domain/).
- `dbname` is the name of the database. "neondb" is the default database created with each Neon project.
- `?sslmode=require` an optional query parameter that enforces the [SSL](https://www.cloudflare.com/en-gb/learning/ssl/what-is-ssl/) mode while connecting to the Postgres instance for better security.

**Important**: To ensure the security of your data, never expose your Neon credentials to the browser.

## Build and run the Java application

This example uses Maven for dependency management. Make sure you have Maven installed on your system.

Run the following command to build the project:

```bash
mvn clean package
```

Run the Java application using the following command:

```bash
mvn exec:java
```

Alternatively, you can run the application directly with Java:

```bash
java -cp target/neon-jdbc-example-1.0-SNAPSHOT.jar com.neon.example.NeonJdbcExample
```

## What this example does

This example demonstrates how to:

1. Connect to a Neon PostgreSQL database using JDBC
2. Create a table if it doesn't exist
3. Insert single and multiple records using prepared statements
4. Query records from the database
5. Update existing records
6. Delete records from the database

The example uses proper error handling and resource management with try-with-resources to ensure connections are properly closed.
