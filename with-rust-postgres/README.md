<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Rust using the `postgres` crate

This example demonstrates how to connect to a Neon database from a Rust application using the synchronous [`postgres`](https://crates.io/crates/postgres) crate. The application is structured with multiple binaries to perform basic CRUD (Create, Read, Update, Delete) operations.

## Clone the repository

Run the following command to clone the example repository:

```bash
npx degit neondatabase/examples/with-rust-postgres neon-rust-postgres
cd neon-rust-postgres
```

Run the command below to copy the `.env.example` file:

```bash
cp .env.example .env
```

## Store your Neon credentials

Open the `.env` file you just created and add your Neon database connection string.

```ini
DATABASE_URL="postgresql://[user]:[password]@[neon_hostname]/[dbname]?sslmode=require&channel_binding=require"
```

You can find your connection string in the **Connection Details** widget on the Neon **Dashboard**.

-   `user` is the database user.
-   `password` is the database user’s password.
-   `neon_hostname` is the host of your Neon endpoint.
-   `dbname` is the name of the database. `neondb` is the default database created with each Neon project.
-   `?sslmode=require` enforces a secure SSL/TLS connection to your database.
-   `&channel_binding=require` enforces channel binding for additional security.

**Important**: To ensure the security of your data, never commit your `.env` file to version control or expose your Neon credentials in client-side code.

## Running the examples

This project is configured with multiple binary targets in `Cargo.toml`, one for each CRUD operation. You can run each script individually using the `cargo run --bin <binary_name>` command. Cargo will automatically download and compile all necessary dependencies on the first run.

### 1. Create a table and insert data

The `create_table.rs` script connects to your Neon database, drops the `books` table if it exists, creates a new `books` table, and populates it with four records.

Run the script from your terminal:

```bash
cargo run --bin create_table
```

You should see the following output, confirming that the connection was successful and the operations were completed:

```text
Connection established
Finished dropping table (if it existed).
Finished creating table.
Inserted a single book.
Starting transaction to insert multiple books...
Inserted 3 rows of data.
```

### 2. Read data

The `read_data.rs` script fetches all records from the `books` table and prints them to the console, ordered by publication year.

Run the script to verify the data was inserted correctly:

```bash
cargo run --bin read_data
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

The `update_data.rs` script updates the `in_stock` status for the book titled 'Dune' from `false` to `true`.

Run the script to perform the update:

```bash
cargo run --bin update_data
```

Output:

```text
Connection established
Updated stock status for 'Dune'.
```

You can run `cargo run --bin read_data` again to see the change reflected in the data.

### 4. Delete data

The `delete_data.rs` script deletes the book titled '1984' from the table.

Run the script to perform the deletion:

```bash
cargo run --bin delete_data
```

Output:

```text
Connection established
Deleted the book '1984' from the table.
```

Run `cargo run --bin read_data` one last time to verify that the record has been removed.

## Further Reading

-   [Neon Documentation: Connect with Rust](https://neon.com/docs/guides/rust)
-   [`postgres` crate documentation](https://docs.rs/postgres/latest/postgres/)
-   [The Rust Programming Language Book](https://doc.rust-lang.org/book/)