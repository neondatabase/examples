package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}
	connStr := os.Getenv("DATABASE_URL")
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		panic(err)
	}
	defer db.Close()
	db.Query("CREATE TABLE IF NOT EXISTS playing_with_neon(id SERIAL PRIMARY KEY, name TEXT NOT NULL, value REAL);")
	db.Query("INSERT INTO playing_with_neon(name, value) SELECT LEFT(md5(i::TEXT), 10), random() FROM generate_series(1, 10) s(i);")
	rows, err := db.Query("SELECT * FROM playing_with_neon")
	if err != nil {
		panic(err)
	}
	defer rows.Close()
	for rows.Next() {
		var id int32
		var name string
		var value float32
		if err := rows.Scan(&id, &name, &value); err != nil {
			panic(err)
		}
		fmt.Printf("%d | %s | %f\n", id, name, value)
	}
}
