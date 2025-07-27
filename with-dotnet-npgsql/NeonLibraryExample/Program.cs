using Microsoft.Extensions.Configuration;
using Npgsql;
using System.Text;

// --- 1. Read configuration and build connection string ---
var config = new ConfigurationBuilder()
    .SetBasePath(Directory.GetCurrentDirectory())
    .AddJsonFile("appsettings.json")
    .Build();

var connectionString = config.GetConnectionString("DefaultConnection");

// --- 2. Establish connection and perform CRUD operations ---
await using var conn = new NpgsqlConnection(connectionString);
try
{
    await conn.OpenAsync();
    Console.WriteLine("Connection established");

    // --- CREATE a table and INSERT data ---
    await using (var cmd = new NpgsqlCommand())
    {
        cmd.Connection = conn;

        cmd.CommandText = "DROP TABLE IF EXISTS books;";
        await cmd.ExecuteNonQueryAsync();
        Console.WriteLine("Finished dropping table (if it existed).");

        cmd.CommandText = @"
            CREATE TABLE books (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                author VARCHAR(255),
                publication_year INT,
                in_stock BOOLEAN DEFAULT TRUE
            );";
        await cmd.ExecuteNonQueryAsync();
        Console.WriteLine("Finished creating table.");

        cmd.CommandText = "INSERT INTO books (title, author, publication_year, in_stock) VALUES (@t1, @a1, @y1, @s1);";
        cmd.Parameters.AddWithValue("t1", "The Catcher in the Rye");
        cmd.Parameters.AddWithValue("a1", "J.D. Salinger");
        cmd.Parameters.AddWithValue("y1", 1951);
        cmd.Parameters.AddWithValue("s1", true);
        await cmd.ExecuteNonQueryAsync();
        Console.WriteLine("Inserted a single book.");
        cmd.Parameters.Clear();

        var booksToInsert = new[] {
            new { Title = "The Hobbit", Author = "J.R.R. Tolkien", Year = 1937, InStock = true },
            new { Title = "1984", Author = "George Orwell", Year = 1949, InStock = true },
            new { Title = "Dune", Author = "Frank Herbert", Year = 1965, InStock = false }
        };

        foreach (var book in booksToInsert)
        {
            cmd.CommandText = "INSERT INTO books (title, author, publication_year, in_stock) VALUES (@title, @author, @year, @in_stock);";
            cmd.Parameters.AddWithValue("title", book.Title);
            cmd.Parameters.AddWithValue("author", book.Author);
            cmd.Parameters.AddWithValue("year", book.Year);
            cmd.Parameters.AddWithValue("in_stock", book.InStock);
            await cmd.ExecuteNonQueryAsync();
            cmd.Parameters.Clear();
        }
        Console.WriteLine("Inserted 3 rows of data.");
    }

    // --- READ the initial data ---
    await ReadDataAsync(conn, "Book Library");

    // --- UPDATE data ---
    await using (var cmd = new NpgsqlCommand("UPDATE books SET in_stock = @in_stock WHERE title = @title;", conn))
    {
        cmd.Parameters.AddWithValue("in_stock", true);
        cmd.Parameters.AddWithValue("title", "Dune");
        await cmd.ExecuteNonQueryAsync();
        Console.WriteLine("Updated stock status for 'Dune'.");
    }

    // --- READ data after update ---
    await ReadDataAsync(conn, "Book Library After Update");

    // --- DELETE data ---
    await using (var cmd = new NpgsqlCommand("DELETE FROM books WHERE title = @title;", conn))
    {
        cmd.Parameters.AddWithValue("title", "1984");
        await cmd.ExecuteNonQueryAsync();
        Console.WriteLine("Deleted the book '1984' from the table.");
    }

    // --- READ data after delete ---
    await ReadDataAsync(conn, "Book Library After Delete");

}
catch (Exception e)
{
    Console.WriteLine("Connection failed.");
    Console.WriteLine(e.Message);
}

// Helper function to read data and print it to the console
async Task ReadDataAsync(NpgsqlConnection conn, string title)
{
    Console.WriteLine($"\n--- {title} ---");
    await using var cmd = new NpgsqlCommand("SELECT * FROM books ORDER BY publication_year;", conn);
    await using var reader = await cmd.ExecuteReaderAsync();

    var books = new StringBuilder();
    while (await reader.ReadAsync())
    {
        books.AppendLine(
            $"ID: {reader.GetInt32(0)}, " +
            $"Title: {reader.GetString(1)}, " +
            $"Author: {reader.GetString(2)}, " +
            $"Year: {reader.GetInt32(3)}, " +
            $"In Stock: {reader.GetBoolean(4)}"
        );
    }
    Console.WriteLine(books.ToString().TrimEnd());
    Console.WriteLine("--------------------\n");
}