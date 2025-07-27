defmodule ReadData do
  def run do
    # Fetch connection config
    config = Application.get_all_env(:with_elixir_postgrex)

    # Start a connection to the database
    {:ok, pid} = Postgrex.start_link(config)
    IO.puts("Connection established")

    try do
      # Fetch all rows from the books table
      result = Postgrex.query!(pid, "SELECT * FROM books ORDER BY publication_year;", [])

      IO.puts("\n--- Book Library ---")
      for row <- result.rows do
        [id, title, author, year, in_stock] = row
        IO.puts(
          "ID: #{id}, Title: #{title}, Author: #{author}, Year: #{year}, In Stock: #{in_stock}"
        )
      end
      IO.puts("--------------------\n")
    rescue
      e -> IO.inspect(e)
    end
  end
end

ReadData.run()
