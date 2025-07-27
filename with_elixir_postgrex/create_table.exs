defmodule CreateTable do
  def run do
    # Fetch connection config
    config = Application.get_all_env(:with_elixir_postgrex)

    # Start a connection to the database
    {:ok, pid} = Postgrex.start_link(config)
    IO.puts("Connection established")

    try do
      # Drop the table if it already exists
      Postgrex.query!(pid, "DROP TABLE IF EXISTS books;", [])
      IO.puts("Finished dropping table (if it existed).")

      # Create a new table
      Postgrex.query!(pid, """
      CREATE TABLE books (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          author VARCHAR(255),
          publication_year INT,
          in_stock BOOLEAN DEFAULT TRUE
      );
      """, [])
      IO.puts("Finished creating table.")

      # Insert a single book record
      Postgrex.query!(
        pid,
        "INSERT INTO books (title, author, publication_year, in_stock) VALUES ($1, $2, $3, $4);",
        ["The Catcher in the Rye", "J.D. Salinger", 1951, true]
      )
      IO.puts("Inserted a single book.")

      # Data to be inserted
      books_to_insert = [
        {"The Hobbit", "J.R.R. Tolkien", 1937, true},
        {"1984", "George Orwell", 1949, true},
        {"Dune", "Frank Herbert", 1965, false}
      ]

      # Prepare a statement for efficient multiple inserts
      {:ok, statement} = Postgrex.prepare(
        pid,
        "insert_books",
        "INSERT INTO books (title, author, publication_year, in_stock) VALUES ($1, $2, $3, $4);"
      )

      # Insert multiple books at once
      Enum.each(books_to_insert, fn {title, author, year, stock} ->
        Postgrex.execute!(pid, statement, [title, author, year, stock])
      end)

      IO.puts("Inserted 3 rows of data.")
    rescue
      e -> IO.inspect(e, label: "An error occurred")
    end
  end
end

# Run the script
CreateTable.run()
