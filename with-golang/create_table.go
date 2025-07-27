package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

func main() {
	// Load environment variables from .env file
	err := godotenv.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading .env file: %v\n", err)
		os.Exit(1)
	}

	// Get the connection string from the environment variable
	connString := os.Getenv("DATABASE_URL")
	if connString == "" {
		fmt.Fprintf(os.Stderr, "DATABASE_URL not set\n")
		os.Exit(1)
	}

	ctx := context.Background()

	// Connect to the database
	conn, err := pgx.Connect(ctx, connString)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	fmt.Println("Connection established")

	// Drop the table if it already exists
	_, err = conn.Exec(ctx, "DROP TABLE IF EXISTS books;")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to drop table: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Finished dropping table (if it existed).")

	// Create a new table
	_, err = conn.Exec(ctx, `
        CREATE TABLE books (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            author VARCHAR(255),
            publication_year INT,
            in_stock BOOLEAN DEFAULT TRUE
        );
    `)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to create table: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Finished creating table.")

	// Insert a single book record
	_, err = conn.Exec(ctx,
		"INSERT INTO books (title, author, publication_year, in_stock) VALUES ($1, $2, $3, $4);",
		"The Catcher in the Rye", "J.D. Salinger", 1951, true,
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to insert single row: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Inserted a single book.")

	// Data to be inserted
	booksToInsert := [][]interface{}{
		{"The Hobbit", "J.R.R. Tolkien", 1937, true},
		{"1984", "George Orwell", 1949, true},
		{"Dune", "Frank Herbert", 1965, false},
	}

	// Use CopyFrom for efficient bulk insertion
	copyCount, err := conn.CopyFrom(
		ctx,
		pgx.Identifier{"books"},
		[]string{"title", "author", "publication_year", "in_stock"},
		pgx.CopyFromRows(booksToInsert),
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to copy rows: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Inserted %d rows of data.\n", copyCount)
}
