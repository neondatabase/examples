<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Node.js using postgres.js

This example demonstrates how to connect to a Neon database from a Node.js application using the modern [`postgres.js`](https://www.npmjs.com/package/postgres) library. The application is structured with multiple scripts to perform basic CRUD (Create, Read, Update, Delete) operations.

## Clone the repository

Run the following command to clone the example repository:

```bash
npx degit neondatabase/examples/with-node-postgres-js ./with-node-postgres-js
cd ./with-node-postgres-js
```

Run the command below to copy the `.env.example` file to `.env`, where you will store your Neon connection string:

```bash
cp .env.example .env
```

## Store your Neon credentials

Open the `.env` file you just created and add your Neon database connection string. You can find this in the **Connect** modal on your Neon Project dashboard.

```
DATABASE_URL="postgresql://[user]:[password]@[neon_hostname]/[dbname]?sslmode=require&channel_binding=require"
```

-   `user`: The database user.
-   `password`: The database user’s password.
-   `hostname`: The host for your Neon endpoint.
-   `dbname`: The name of the database. `neondb` is the default database created with each Neon project.
-   `?sslmode=require`: Enforces SSL mode to securely connect to the Postgres instance.
-   `&channel_binding=require`: Ensures that the connection uses channel binding for enhanced security.

**Important**: To ensure the security of your data, never commit your `.env` file to version control or expose your Neon credentials in client-side code.

## Install dependencies

Run the command below to install the project dependencies listed in your `package.json` file:

```bash
npm install
```

## Running the examples

The project includes four JavaScript scripts in the root directory that demonstrate how to perform basic CRUD (Create, Read, Update, Delete) operations.

### 1. Create a table and insert data

The `create_table.js` script connects to your Neon database, drops the `books` table if it exists, creates a new `books` table, and populates it with four records.

Run the script from your terminal:

```bash
node create_table.js
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

The `read_data.js` script fetches all records from the `books` table and prints them to the console.

Run the script to verify the data was inserted correctly:

```bash
node read_data.js
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

The `update_data.js` script updates the `in_stock` status for the book titled 'Dune' from `false` to `true`.

Run the script to perform the update:

```bash
node update_data.js
```

Output:

```text
Connection established
Updated stock status for 'Dune'.
```

You can run `node read_data.js` again to see the change reflected in the data.

### 4. Delete data

The `delete_data.js` script deletes the book titled '1984' from the table.

Run the script to perform the deletion:

```bash
node delete_data.js
```

Output:

```text
Connection established
Deleted the book '1984' from the table.
```

Run `node read_data.js` one last time to verify that the record has been removed.

## Further Reading

-   [Neon Documentation](https://neon.com/docs/guides/javascript)
-   [postgres.js Documentation](https://github.com/porsager/postgres)