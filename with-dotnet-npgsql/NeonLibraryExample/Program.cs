using System;
using Npgsql;
using Microsoft.Extensions.Configuration;

class Program
{
    static void Main()
    {
        // Load configuration and build connection string
        var configuration = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json")
            .Build();

        string connString = configuration.GetConnectionString("DefaultConnection");

        try
        {
            // Create table
            using (var conn = new NpgsqlConnection(connString))
            {
                Console.Out.WriteLine("Opening connection");
                conn.Open();
                using (var command = new NpgsqlCommand(
                    @"DROP TABLE IF EXISTS books;
          CREATE TABLE books (
              id SERIAL PRIMARY KEY,
              title VARCHAR(100) NOT NULL,
              author VARCHAR(100) NOT NULL,
              year_published INTEGER
          )", conn))
                {
                    command.ExecuteNonQuery();
                    Console.Out.WriteLine("Finished creating table");
                }
            }

            // Insert books
            using (var conn = new NpgsqlConnection(connString))
            {
                Console.Out.WriteLine("Opening connection");
                conn.Open();

                using (var command = new NpgsqlCommand(
                    @"INSERT INTO books (title, author, year_published)
          VALUES (@t1, @a1, @y1), (@t2, @a2, @y2)", conn))
                {
                    command.Parameters.AddWithValue("t1", "The Great Gatsby");
                    command.Parameters.AddWithValue("a1", "F. Scott Fitzgerald");
                    command.Parameters.AddWithValue("y1", 1925);

                    command.Parameters.AddWithValue("t2", "1984");
                    command.Parameters.AddWithValue("a2", "George Orwell");
                    command.Parameters.AddWithValue("y2", 1949);

                    int nRows = command.ExecuteNonQuery();
                    Console.Out.WriteLine($"Number of books added={nRows}");
                }
            }

            // Read data
            using (var conn = new NpgsqlConnection(connString))
            {
                Console.Out.WriteLine("Opening connection");
                conn.Open();

                using (var command = new NpgsqlCommand("SELECT * FROM books", conn))
                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        Console.WriteLine(
                            $"Reading from table=({reader.GetInt32(0)}, {reader.GetString(1)}, " +
                            $"{reader.GetString(2)}, {reader.GetInt32(3)})");
                    }
                }
            }

            // Update data
            using (var conn = new NpgsqlConnection(connString))
            {
                Console.Out.WriteLine("Opening connection");
                conn.Open();

                using (var command = new NpgsqlCommand(
                    @"UPDATE books
          SET year_published = @year
          WHERE id = @id", conn))
                {
                    command.Parameters.AddWithValue("id", 1);
                    command.Parameters.AddWithValue("year", 1926);

                    int nRows = command.ExecuteNonQuery();
                    Console.Out.WriteLine($"Number of books updated={nRows}");
                }
            }

            // Delete data
            using (var conn = new NpgsqlConnection(connString))
            {
                Console.Out.WriteLine("Opening connection");
                conn.Open();

                using (var command = new NpgsqlCommand(
                    "DELETE FROM books WHERE id = @id", conn))
                {
                    command.Parameters.AddWithValue("id", 2);

                    int nRows = command.ExecuteNonQuery();
                    Console.Out.WriteLine($"Number of books deleted={nRows}");
                }
            }

            // Read some books to verify the changes
            using (var conn = new NpgsqlConnection(connString))
            {
                Console.Out.WriteLine("Opening connection");
                conn.Open();

                using (var command = new NpgsqlCommand("SELECT * FROM books", conn))
                using (var reader = command.ExecuteReader())
                {
                    Console.WriteLine("\nFinal table contents:");
                    while (reader.Read())
                    {
                        Console.WriteLine(
                            $"Reading from table=({reader.GetInt32(0)}, {reader.GetString(1)}, " +
                            $"{reader.GetString(2)}, {reader.GetInt32(3)})");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"An error occurred: {ex.Message}");
        }

        Console.WriteLine("Press RETURN to exit");
        Console.ReadLine();
    }
}