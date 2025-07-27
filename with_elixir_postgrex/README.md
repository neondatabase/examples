<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Elixir using Postgrex

This example demonstrates how to connect to a Neon database from an Elixir application using the [`postgrex`](https://hex.pm/packages/postgrex) library. The application is structured with multiple scripts to perform basic CRUD (Create, Read, Update, Delete) operations.

## Clone the repository

Run the following command to clone the example repository:

```bash
npx degit neondatabase/examples/with_elixir_postgrex ./with_elixir_postgrex
cd with_elixir_postgrex
```

Run the command below to copy the `config.exs.example` file to `config.exs`, where you will store your Neon credentials:

```bash
cp config/config.exs.example config/config.exs
```

## Store your Neon credentials

Open the `config/config.exs` file you just created and add your Neon database credentials. You can find these in the **Connect** modal on your Neon Project dashboard.

```elixir
import Config

config :neon_elixir_quickstart,
  username: "[user]",
  password: "[password]",
  hostname: "[neon_hostname]",
  database: "[dbname]",
  ssl: [cacerts: :public_key.cacerts_get()]
```

-   `username`: The database user.
-   `password`: The database user’s password.
-   `hostname`: The host for your Neon endpoint.
-   `database`: The name of the database. `neondb` is the default database created with each Neon project.
-   `ssl`: The SSL configuration required to connect securely to Neon.

**Important**: To ensure the security of your data, never commit your `config/config.exs` file to version control or expose your Neon credentials in client-side code.

## Install dependencies

Run the command below to install the project dependencies listed in your `mix.exs` file:

```bash
mix deps.get
```

## Running the examples

The project includes four Elixir scripts in the root directory that demonstrate how to perform basic CRUD (Create, Read, Update, Delete) operations. The scripts are run using `mix run` to ensure they have access to the project's configuration and dependencies.

### 1. Create a table and insert data

The `create_table.exs` script connects to your Neon database, drops the `books` table if it exists, creates a new `books` table, and populates it with four records.

Run the script from your terminal:

```bash
mix run create_table.exs
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

The `read_data.exs` script fetches all records from the `books` table and prints them to the console.

Run the script to verify the data was inserted correctly:

```bash
mix run read_data.exs
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

The `update_data.exs` script updates the `in_stock` status for the book titled 'Dune' from `false` to `true`.

Run the script to perform the update:

```bash
mix run update_data.exs
```

Output:

```text
Connection established
Updated stock status for 'Dune'.
```

You can run `mix run read_data.exs` again to see the change reflected in the data.

### 4. Delete data

The `delete_data.exs` script deletes the book titled '1984' from the table.

Run the script to perform the deletion:

```bash
mix run delete_data.exs
```

Output:

```text
Connection established
Deleted the book '1984' from the table.
```

Run `mix run read_data.exs` one last time to verify that the record has been removed.

## Further Reading

-   [Neon Documentation](https://neon.com/docs/guides/elixir)
-   [Postgrex Documentation](https://hexdocs.pm/postgrex/Postgrex.html)