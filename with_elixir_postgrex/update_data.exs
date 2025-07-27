defmodule UpdateData do
  def run do
    # Fetch connection config
    config = Application.get_all_env(:with_elixir_postgrex)

    # Start a connection to the database
    {:ok, pid} = Postgrex.start_link(config)
    IO.puts("Connection established")

    try do
      # Update a data row in the table
      Postgrex.query!(pid, "UPDATE books SET in_stock = $1 WHERE title = $2;", [true, "Dune"])
      IO.puts("Updated stock status for 'Dune'.")
    rescue
      e -> IO.inspect(e)
    end
  end
end

UpdateData.run()
