defmodule DeleteData do
  def run do
    # Fetch connection config
    config = Application.get_all_env(:with_elixir_postgrex)

    # Start a connection to the database
    {:ok, pid} = Postgrex.start_link(config)
    IO.puts("Connection established")

    try do
      # Delete a data row from the table
      Postgrex.query!(pid, "DELETE FROM books WHERE title = $1;", ["1984"])
      IO.puts("Deleted the book '1984' from the table.")
    rescue
      e -> IO.inspect(e)
    end
  end
end

DeleteData.run()
