<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and .NET using Npgsql

This example demonstrates how to connect to a Neon database from a .NET console application using the [`Npgsql`](https://www.npgsql.org/) library. The application performs a sequence of basic CRUD (Create, Read, Update, Delete) operations.

## Clone the repository

Run the following command to clone the example repository:

```bash
npx degit neondatabase/examples/with-dotnet-npgsql/NeonLibraryExample ./with-dotnet-npgsql
cd with-dotnet-npgsql
```

Run the command below to copy the `appsettings.json.example` file to `appsettings.json`, where you will store your Neon credentials:

```bash
cp appsettings.json.example appsettings.json
```

## Store your Neon credentials

Open the `appsettings.json` file you just created and add your Neon database connection string. You can find this in the **Connect** modal on your Neon Project dashboard.

```json
{
    "ConnectionStrings": {
        "DefaultConnection": "Host=your-neon-host;Database=your-database;Username=your-username;Password=your-password;SSL Mode=VerifyFull; Channel Binding=Require"
    }
}
```

- `Host`: The host address of your Neon database.
- `Database`: The name of your Neon database.
- `Username`: Your Neon database username.
- `Password`: Your Neon database password.
- `SSL Mode`: Set to `VerifyFull` for secure connections.
- `Channel Binding`: Set to `Require` for enhanced security.

> [!IMPORTANT]
> To ensure the security of your data, never commit your `appsettings.json` file to version control or expose your Neon credentials in client-side code.

## Install dependencies

The .NET CLI handles dependency management. Run the following command to restore the packages listed in the `.csproj` file:

```bash
dotnet restore
```

## Running the application

This example application performs the following steps:

1.  Connect to the database.
2.  Create a `books` table and insert four records.
3.  Read and display the initial data.
4.  Update a record and display the results.
5.  Delete a record and display the final state of the table.

Run the application from your terminal:

```bash
dotnet run
```

You should see the following output, which shows the results of the CRUD operations:

```text
Connection established
Finished dropping table (if it existed).
Finished creating table.
Inserted a single book.
Inserted 3 rows of data.

--- Book Library ---
ID: 2, Title: The Hobbit, Author: J.R.R. Tolkien, Year: 1937, In Stock: True
ID: 3, Title: 1984, Author: George Orwell, Year: 1949, In Stock: True
ID: 1, Title: The Catcher in the Rye, Author: J.D. Salinger, Year: 1951, In Stock: True
ID: 4, Title: Dune, Author: Frank Herbert, Year: 1965, In Stock: False
--------------------

Updated stock status for 'Dune'.

--- Book Library After Update ---
ID: 2, Title: The Hobbit, Author: J.R.R. Tolkien, Year: 1937, In Stock: True
ID: 3, Title: 1984, Author: George Orwell, Year: 1949, In Stock: True
ID: 1, Title: The Catcher in the Rye, Author: J.D. Salinger, Year: 1951, In Stock: True
ID: 4, Title: Dune, Author: Frank Herbert, Year: 1965, In Stock: True
--------------------

Deleted the book '1984' from the table.

--- Book Library After Delete ---
ID: 2, Title: The Hobbit, Author: J.R.R. Tolkien, Year: 1937, In Stock: True
ID: 1, Title: The Catcher in the Rye, Author: J.D. Salinger, Year: 1951, In Stock: True
ID: 4, Title: Dune, Author: Frank Herbert, Year: 1965, In Stock: True
--------------------
```

## Further Reading

- [Neon Documentation](https://neon.com/docs/guides/dotnet-npgsql/)
- [Npgsql Documentation](https://www.npgsql.org/doc/)
