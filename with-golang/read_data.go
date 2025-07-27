package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

func main() {
	err := godotenv.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading .env file: %v\n", err)
		os.Exit(1)
	}

	connString := os.Getenv("DATABASE_URL")
	if connString == "" {
		fmt.Fprintf(os.Stderr, "DATABASE_URL not set\n")
		os.Exit(1)
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, connString)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)
	fmt.Println("Connection established")

	// Fetch all rows from the books table
	rows, err := conn.Query(ctx, "SELECT * FROM books ORDER BY publication_year;")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Query failed: %v\n", err)
		os.Exit(1)
	}
	defer rows.Close()

	fmt.Println("\n--- Book Library ---")
	for rows.Next() {
		var id, publicationYear int
		var title, author string
		var inStock bool

		err := rows.Scan(&id, &title, &author, &publicationYear, &inStock)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to scan row: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("ID: %d, Title: %s, Author: %s, Year: %d, In Stock: %t\n",
			id, title, author, publicationYear, inStock)
	}
	fmt.Println("--------------------\n")

	if err := rows.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "Error during rows iteration: %v\n", err)
		os.Exit(1)
	}
}
