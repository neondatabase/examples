<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Java using JDBC

This example demonstrates how to connect to a Neon database from a Java application using the standard PostgreSQL **JDBC driver**. The application is structured with multiple Java classes to perform basic CRUD (Create, Read, Update, Delete) operations.

## Clone the repository

Run the following command to clone the example repository:

```bash
npx degit neondatabase/examples/with-java-jdbc ./with-java-jdbc
cd with-java-jdbc
```

Run the command below to copy the `.env.example` file:

```bash
cp .env.example .env
```

## Store your Neon credentials

Open the `.env` file you just created and add your Neon database connection string. The connection string for the PostgreSQL JDBC driver must start with `jdbc:postgresql://`.

```
DATABASE_URL="jdbc:postgresql://[user]:[password]@[neon_hostname]/[dbname]?sslmode=require&channelBinding=require"
```

- `user` is the database user.
- `password` is the database user’s password.
- `endpoint_hostname` is the host with neon.tech as the [TLD](https://www.cloudflare.com/en-gb/learning/dns/top-level-domain/).
- `dbname` is the name of the database. “neondb” is the default database created with each Neon project.
- `?sslmode=require` enforces the [SSL](https://www.cloudflare.com/en-gb/learning/ssl/what-is-ssl/) mode while connecting to the Postgres instance for better security.
- `&channelBinding=require` enforces channel binding for additional security when using the PostgreSQL JDBC driver.

**Important**: To ensure the security of your data, never commit your `.env` file to version control.

## Build the project

This project uses Apache Maven to manage dependencies. Run the following command to download the required libraries (like the PostgreSQL driver) and compile the project:

```bash
mvn clean compile
```

Maven will read the `pom.xml` file and handle the dependency installation for you.

## Running the examples

The project includes four Java classes in the `src/main/java/com/neon/quickstart/` directory that demonstrate how to perform basic CRUD operations. You can run each class from your terminal using Maven.

### 1. Create a table and insert data

The `CreateTable.java` class connects to your Neon database, drops the `books` table if it exists, creates a new `books` table, and populates it with four records.

Run the class from your terminal:

```bash
mvn exec:java -Dexec.mainClass="com.neon.quickstart.CreateTable"
```

You should see the following output, confirming that the connection was successful and the operations were completed:

```text
Connection established
Finished dropping table (if it existed).
Finished creating table.
Inserted a single book.
Inserted 3 rows of data.
```

### 2. Read data

The `ReadData.java` class fetches all records from the `books` table and prints them to the console.

Run the class to verify the data was inserted correctly:

```bash
mvn exec:java -Dexec.mainClass="com.neon.quickstart.ReadData"
```

Output:

```text
Connection established

--- Book Library ---
ID: 2, Title: The Hobbit, Author: J.R.R. Tolkien, Year: 1937, In Stock: true
ID: 3, Title: 1984, Author: George Orwell, Year: 1949, In Stock: true
ID: 1, Title: The Catcher in the Rye, Author: J.D. Salinger, Year: 1951, In Stock: true
ID: 4, Title: Dune, Author: Frank Herbert, Year: 1965, In Stock: false
--------------------
```

### 3. Update data

The `UpdateData.java` class updates the `in_stock` status for the book titled 'Dune' from `false` to `true`.

Run the class to perform the update:

```bash
mvn exec:java -Dexec.mainClass="com.neon.quickstart.UpdateData"
```

Output:
```text
Connection established
Updated stock status for 'Dune'.
```

You can run `mvn exec:java -Dexec.mainClass="com.neon.quickstart.ReadData"` again to see the change reflected in the data.

### 4. Delete data

The `DeleteData.java` class deletes the book titled '1984' from the table.

Run the class to perform the deletion:

```bash
mvn exec:java -Dexec.mainClass="com.neon.quickstart.DeleteData"
```

Output:

```text
Connection established
Deleted the book '1984' from the table.
```

Run `mvn exec:java -Dexec.mainClass="com.neon.quickstart.ReadData"` one last time to verify that the record has been removed.

## Further Reading

- [Neon Documentation](https://neon.com/docs/guides/java)
- [PostgreSQL JDBC Driver Documentation](https://jdbc.postgresql.org/documentation/use/)