<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Python using psycopg2

## Clone the repository

```bash
npx degit neondatabase/examples/with-python-psycopg2 ./with-python-psycopg2
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
- `password` is the database user’s password.
- `endpoint_hostname` is the host with neon.tech as the [TLD](https://www.cloudflare.com/en-gb/learning/dns/top-level-domain/).
- `dbname` is the name of the database. “neondb” is the default database created with each Neon project.
- `?sslmode=require` an optional query parameter that enforces the [SSL](https://www.cloudflare.com/en-gb/learning/ssl/what-is-ssl/) mode while connecting to the Postgres instance for better security.

**Important**: To ensure the security of your data, never expose your Neon credentials to the browser.

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
- [Psycopg 2 Documentation](https://www.psycopg.org/docs/)
