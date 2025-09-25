<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Python using psycopg (v3)

This example demonstrates how to connect to a Neon database from a Python application using the modern synchronous [`psycopg`](https://pypi.org/project/psycopg/) (v3) library. The application is structured with multiple scripts to perform basic CRUD (Create, Read, Update, Delete) operations.

## Clone the repository

Run the following command to clone the example repository:

```bash
npx degit neondatabase/examples/with-python-psycopg ./with-python-psycopg
cd with-python-psycopg
```

Run the command below to copy the `.env.example` file:

```
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

Run one of the following commands to create a virtual environment:

```bash
# Create a virtual environment
python -m venv venv

# Active the virtual environment (Windows)
.\venv\Scripts\activate.bat

# Active the virtual environment (Linux)
source ./venv/bin/activate
```

Run the command below to install project dependencies:

```
pip install -r requirements.txt
```

## Running the examples

The project includes four Python scripts in the root directory that demonstrate how to perform basic CRUD (Create, Read, Update, Delete) operations.

### 1. Create a table and insert data

The `create_table.py` script connects to your Neon database, drops the `books` table if it exists, creates a new `books` table, and populates it with four records.

Run the script from your terminal:

```bash
python create_table.py
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

The `read_data.py` script fetches all records from the `books` table and prints them to the console.

Run the script to verify the data was inserted correctly:

```bash
python read_data.py
```

Output:

```text
Connection established

--- Book Library ---
ID: 2, Title: The Hobbit, Author: J.R.R. Tolkien, Year: 1937, In Stock: True
ID: 3, Title: 1984, Author: George Orwell, Year: 1949, In Stock: True
ID: 1, Title: The Catcher in the Rye, Author: J.D. Salinger, Year: 1951, In Stock: True
ID: 4, Title: Dune, Author: Frank Herbert, Year: 1965, In Stock: False
--------------------
```

### 3. Update data

The `update_data.py` script updates the `in_stock` status for the book titled 'Dune' from `False` to `True`.

Run the script to perform the update:

```bash
python update_data.py
```

Output:
```text
Connection established
Updated stock status for 'Dune'.
```

You can run `python read_data.py` again to see the change reflected in the data.

### 4. Delete data

The `delete_data.py` script deletes the book titled '1984' from the table.

Run the script to perform the deletion:

```bash
python delete_data.py
```

Output:
```text
Connection established
Deleted the book '1984' from the table.
```

Run `python read_data.py` one last time to verify that the record has been removed.

## Further Reading

- [Neon Documentation](https://neon.com/docs/guides/python)
- [Psycopg 3 Documentation](https://www.psycopg.org/psycopg3/docs/)