<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Go using pgx

This example demonstrates how to connect to a Neon database from a Go application using the [`pgx`](https://github.com/jackc/pgx) library. The application is structured with multiple scripts to perform basic CRUD (Create, Read, Update, Delete) operations.

## Clone the repository

Run the following command to clone the example repository:

```bash
npx degit neondatabase/examples/with-golang ./with-golang
cd with-golang
```

Run the command below to copy the `.env.example` file:

```bash
cp .env.example .env
```

## Store your Neon credentials

Open the `.env` file you just created and add your Neon database connection string.

```
DATABASE_URL="postgresql://neondb_owner:...@ep-...us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

- `user` is the database user.
- `password` is the database user’s password.
- `endpoint_hostname` is the host with neon.tech as the [TLD](https://www.cloudflare.com/en-gb/learning/dns/top-level-domain/).
- `dbname` is the name of the database. “neondb” is the default database created with each Neon project.
- `?sslmode=require` an optional query parameter that enforces the [SSL](https://www.cloudflare.com/en-gb/learning/ssl/what-is-ssl/) mode while connecting to the Postgres instance for better security.
- `&channel_binding=require` enforces channel binding for additional security.

**Important**: To ensure the security of your data, never commit your `.env` file to version control or expose your Neon credentials in client-side code.

## Install dependencies

Run the command below to download the Go modules required for this project, such as `pgx` and `godotenv`. This command ensures your `go.mod` file is in sync with the source code.

```bash
go mod tidy
```

## Running the examples

The project includes four Go scripts in the root directory that demonstrate how to perform basic CRUD (Create, Read, Update, Delete) operations.

### 1. Create a table and insert data

The `create_table.go` script connects to your Neon database, drops the `books` table if it exists, creates a new `books` table, and populates it with four records.

Run the script from your terminal:

```bash
go run create_table.go
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

The `read_data.go` script fetches all records from the `books` table and prints them to the console.

Run the script to verify the data was inserted correctly:

```bash
go run read_data.go
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

The `update_data.go` script updates the `in_stock` status for the book titled 'Dune' from `false` to `true`.

Run the script to perform the update:

```bash
go run update_data.go
```

Output:
```text
Connection established
Updated stock status for 'Dune'.
```

You can run `go run read_data.go` again to see the change reflected in the data.

### 4. Delete data

The `delete_data.go` script deletes the book titled '1984' from the table.

Run the script to perform the deletion:

```bash
go run delete_data.go
```

Output:
```text
Connection established
Deleted the book '1984' from the table.
```

Run `go run read_data.go` one last time to verify that the record has been removed.

## Further Reading

- [Neon Documentation](https://neon.com/docs/guides/go)
- [pgx Documentation](https://pkg.go.dev/github.com/jackc/pgx/v5)
